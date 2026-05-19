import os
import re
import json
from pathlib import Path
from typing import Annotated, Any, Dict, List, Optional, TypedDict

from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from context.init_models import db, get_llm

import pickle
from langchain_community.retrievers import BM25Retriever
from langchain_classic.retrievers import EnsembleRetriever

try:
    docs_path = os.path.join(os.path.dirname(__file__), "chroma_db", "docs.pkl")
    with open(docs_path, "rb") as f:
        all_docs = pickle.load(f)
    bm25_retriever = BM25Retriever.from_documents(all_docs)
except Exception as e:
    print(f"Error loading docs.pkl for BM25: {e}")
    bm25_retriever = None

def check_filter_match(doc: Any, filters: Optional[Dict[str, Any]]) -> bool:
    if not filters:
        return True
    metadata = getattr(doc, "metadata", {}) or {}
    def match_condition(cond: Dict[str, Any]) -> bool:
        for k, v in cond.items():
            if k == "$and":
                return all(match_condition(c) for c in v)
            if k == "$or":
                return any(match_condition(c) for c in v)
            doc_val = metadata.get(k)
            if isinstance(v, dict):
                for op, op_val in v.items():
                    if op == "$gte":
                        if doc_val is None or doc_val < op_val: return False
                    elif op == "$lte":
                        if doc_val is None or doc_val > op_val: return False
                    elif op == "$eq":
                        if doc_val != op_val: return False
            else:
                if doc_val != v: return False
        return True
    return match_condition(filters)

# =====================================================
# CONFIG
# =====================================================

CATEGORY_KEYWORDS = {
    "cpu": ["cpu", "vi xu ly", "vi xử lý", "chip"],
    "gpu": ["gpu", "vga", "card man hinh", "card màn hình"],
    "psu": ["psu", "nguon", "nguồn"],
    "ram": ["ram"],
    "storage": ["ssd", "hdd", "nvme", "storage", "o cung", "ổ cứng"],
    "mainboard": ["main", "mainboard", "bo mach", "bo mạch", "motherboard"],
    "cpu_cooler": ["cpu_cooler","cooler", "tan", "tản"],
    "case": ["case", "vo may", "vỏ máy"],
}

COMPARE_ATTRS: Dict[str, List[str]] = {
    "cpu": [
        "Core Count",
        "Performance Core Clock",
        "Performance Core Boost Clock",
        "TDP",
        "L3 Cache",
        "Memory Type",
        "Integrated Graphics",
    ],
    "gpu": [
        "Chipset",
        "Memory",
        "Memory Type",
        "Boost Clock",
        "TDP",
        "Length",
        "External Power",
    ],
    "ram": [
        "Capacity",
        "Modules",
        "Type",
        "Speed",
        "CAS Latency",
    ],
    "motherboard": [
        "Socket/CPU",
        "Form Factor",
        "Memory Type",
        "Memory Max",
        "Memory Slots",
        "M.2 Slots",
        "Wireless Networking",
    ],
    "psu": [
        "Wattage",
        "Efficiency Rating",
        "Modular",
    ],
    "storage": [
        "Capacity",
        "Type",
        "Interface",
        "NVME",
        "Form Factor",
    ],
    "case": [
        "Type",
        "Motherboard Form Factor",
        "Maximum Video Card Length",
    ],
    "cpu_cooling": [
        "Water Cooled",
        "Height",
        "Noise Level",
        "Socket/CPU",
    ],
}

COMPATIBILITY_ATTRS: Dict[tuple[str, str], List[str]] = {
    ("cpu", "mainboard"): ["Socket"],
    ("cpu", "cpu_cooler"): ["Socket"],
    ("cpu", "ram"): ["Memory Type"],
    
    ("mainboard", "cpu"): ["Socket/CPU"],
    ("mainboard", "ram"): ["Memory Type"],
    ("mainboard", "case"): ["Form Factor"],
    
    ("ram", "mainboard"): ["Type", "Memory Type"],
    ("ram", "cpu"): ["Type", "Memory Type"],
    
    ("gpu", "case"): ["Length"],
    
    ("case", "mainboard"): ["Motherboard Form Factor"],
    ("case", "gpu"): ["Maximum Video Card Length"],
    
    ("cpu_cooler", "cpu"): ["CPU Socket", "Socket"],
    ("cpu_cooling", "cpu"): ["CPU Socket", "Socket"],
}
# =====================================================
# STATE
# =====================================================

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]


# =====================================================
# HELPERS
# =====================================================

def build_filter(
    product_type: Optional[str] = None,
    min_price: Optional[int] = None,
    max_price: Optional[int] = None
) -> Optional[Dict[str, Any]]:

    conditions = []

    # category
    if product_type:
        conditions.append({
            "category": product_type.strip().lower()
        })

    # price >=
    if min_price is not None:
        conditions.append({
            "price_vnd": {"$gte": min_price}
        })

    # price <=
    if max_price is not None:
        conditions.append({
            "price_vnd": {"$lte": max_price}
        })

    # không có filter
    if not conditions:
        return None

    # chỉ 1 điều kiện → không cần $and
    if len(conditions) == 1:
        return conditions[0]

    # nhiều điều kiện → dùng $and
    return {
        "$and": conditions
    }

def detect_category(text: str) -> Optional[str]:
    text_low = text.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in text_low:
                return category
    return None


def detect_budget(text: str) -> Optional[int]:
    text_low = text.lower().replace(",", ".")

    # 20.5 triệu, 20tr5
    match = re.search(r"(\d+(?:\.\d+)?)\s*(triệu|tr|củ)", text_low)
    if match:
        return int(float(match.group(1)) * 1_000_000)

    # 20tr5
    match = re.search(r"(\d+)tr(\d+)", text_low)
    if match:
        return int((int(match.group(1)) + int(match.group(2)) / 10) * 1_000_000)

    # 500k
    match = re.search(r"(\d+(?:\.\d+)?)\s*k\b", text_low)
    if match:
        return int(float(match.group(1)) * 1_000)

    # 20,000,000
    match = re.search(r"(\d{1,3}(?:[\.,]\d{3})+)", text_low)
    if match:
        cleaned = re.sub(r"[^0-9]", "", match.group(1))
        return int(cleaned)

    return None


def as_vnd(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)

    digits = re.sub(r"[^0-9]", "", str(value))
    return int(digits) if digits else None


def vnd(value: Optional[int]) -> str:
    if value is None:
        return "N/A"
    return f"{value:,}đ".replace(",", ".")


def doc_name(doc: Any) -> str:
    metadata = getattr(doc, "metadata", {}) or {}
    for key in ("name", "title", "product_name"):
        if metadata.get(key):
            return str(metadata[key])

    content = (getattr(doc, "page_content", "") or "").strip().splitlines()
    return content[0][:120] if content else "San pham khong ro ten"


def doc_category(doc: Any) -> str:
    metadata = getattr(doc, "metadata", {}) or {}
    return str(metadata.get("category") or "unknown")


def doc_price(doc: Any) -> Optional[int]:
    metadata = getattr(doc, "metadata", {}) or {}
    return as_vnd(metadata.get("price_vnd") or metadata.get("price"))


def doc_uid(doc: Any) -> str:
    metadata = getattr(doc, "metadata", {}) or {}
    for key in ("product_id", "id", "sku", "slug", "name"):
        if metadata.get(key):
            return str(metadata[key])
    return doc_name(doc)


def doc_image(doc: Any) -> Optional[str]:
    metadata = getattr(doc, "metadata", {}) or {}
    image = metadata.get("image") or metadata.get("image_url")
    print("Doc image metadata:", image)
    return str(image) if image else None


def dedupe_docs(docs: List[Any]) -> List[Any]:
    seen = set()
    output: List[Any] = []
    for doc in docs:
        uid = doc_uid(doc)
        if uid in seen:
            continue
        seen.add(uid)
        output.append(doc)
    return output


def build_context_block(docs: List[Any]) -> str:
    if not docs:
        return "Khong co du lieu san pham phu hop."

    lines: List[str] = []
    for idx, doc in enumerate(docs, start=1):
        product_id = doc_uid(doc)
        # product_link = f"/product-info/{product_id}"
        # image_url = doc_image(doc)
        # content = (getattr(doc, "page_content", "") or "").replace("\n", " ").strip()
        # excerpt = content[:300] if content else "Khong co mo ta"
        # line = (
        #     f"[{idx}] [{doc_name(doc)}]({product_link}) | "
        #     f"category={doc_category(doc)} | price={vnd(doc_price(doc))}\n"
        # )
        line = (
            f"[{idx}] [{doc_name(doc)}] | "
            f"category={doc_category(doc)} | product_id={product_id}"
        )
        # if image_url:
        #     line += f"image: [![{doc_name(doc)}]({image_url})]({product_link})\n"
        # line += f"mo_ta={excerpt}"
        lines.append(line)

    return "\n\n".join(lines)


def format_markdown_output(text: str) -> str:
    if not text:
        return text

    cleaned = text.strip()
    if not cleaned:
        return cleaned



    return cleaned


def ranked_search(query: str, filters: Optional[Dict[str, Any]], k: int = 8) -> List[Any]:
    results: List[Any] = []

    queries = [
        query,
        # f"sản phẩm phù hợp cho nhu cầu {query}",
        # f"linh kiện pc {query}",
    ]

    for q in queries:
        try:
            db_retriever = db.as_retriever(search_kwargs={"k": k, "filter": filters if filters else None})
            if bm25_retriever:
                bm25_retriever.k = max(k * 3, 20)
                ensemble_retriever = EnsembleRetriever(
                    retrievers=[bm25_retriever, db_retriever], weights=[0.4, 0.6]
                )
                docs = ensemble_retriever.invoke(q)
                
                if filters:
                    filtered_docs = [d for d in docs if check_filter_match(d, filters)]
                    docs = filtered_docs[:k]
                else:
                    docs = docs[:k]
                
                results.extend(docs)
            else:
                docs = db_retriever.invoke(q)
                results.extend(docs[:k])
        except Exception as e:
            print(f"Hybrid search error: {e}")
            continue

    return dedupe_docs(results)


def choose_doc_by_budget(
    docs: List[Any],
    target_price: int,
    max_price: int,
) -> Optional[Any]:

    if not docs:
        return None

    if target_price <= 0:
        # Không có thông tin giá mục tiêu → trả doc có rank tốt nhất có price hợp lệ
        for doc in docs:
            price = doc_price(doc)
            if price and price > 0:
                return doc
        return docs[0]

    if target_price > max_price:
        target_price = max_price
        max_price = target_price * 1.1

    candidates: List[Dict[str, Any]] = []

    for rank, doc in enumerate(docs):
        price = doc_price(doc)
        if price is None or price <= 0:
            continue
        candidates.append({
            "doc": doc,
            "price": int(price),
            "rank": rank,
        })

    if not candidates:
        return None

    within_budget = [c for c in candidates if c["price"] <= max_price]
    print("within_budget count:", len(within_budget))
    pool = within_budget if within_budget else candidates

    def score(item: Dict[str, Any]) -> float:
        price = item["price"]
        rank = item["rank"]

        # Độ lệch tuyệt đối so với target (normalize)
        distance_score = abs(price - target_price) / target_price

        # Phạt lũy tiến nếu vượt target (dù vẫn trong max_price)
        over_ratio = max(price - target_price, 0) / target_price
        over_budget_penalty = over_ratio * 2.0

        # Rank là tie-breaker: mỗi bậc chỉ tương đương ~2% giá
        rank_penalty = rank * 0.02

        return distance_score + over_budget_penalty + rank_penalty

    return min(pool, key=score)["doc"]


def update_compat_info(compat_info: Dict[str, Any], chosen: Any, category: str) -> None:
    """Trích xuất thông tin tương thích từ linh kiện đã chọn và cập nhật compat_info."""
    attrs_str = getattr(chosen, "metadata", {}).get("attrs_json", "{}")
    try:
        attrs = json.loads(attrs_str)
    except Exception:
        attrs = {}

    for k, v in attrs.items():
        if k in ["Socket/CPU", "Socket"]:
            if "Socket" not in compat_info:
                compat_info["Socket"] = v
        elif k in ["Type", "Memory Type"] and category in ["ram", "cpu", "mainboard"]:
            if "Memory Type" not in compat_info:
                compat_info["Memory Type"] = v
        elif k in ["Motherboard Form Factor", "Form Factor"] and category not in ["ram", "storage"]:
            if "Form Factor" not in compat_info:
                compat_info["Form Factor"] = v
        elif k in ["Length", "Maximum Video Card Length"]:
            if "Length" not in compat_info:
                compat_info["Length"] = v


def _is_generic_keyword(keyword: str) -> bool:
    """Kiểm tra keyword có phải là đặc tả chung (ít từ, không phải tên sản phẩm cụ thể)."""
    words = keyword.strip().split()
    # Nếu ít hơn hoặc bằng 3 từ → coi là chung chung, cần enrich
    return len(words) <= 3


def resolve_preferred_parts(
    preferred_parts: Dict[str, str],
) -> tuple[Dict[str, Any], Dict[str, Any], Dict[str, str]]:
    """
    Phân loại và xử lý linh kiện người dùng chỉ định.
    - Specific keyword (tên sản phẩm cụ thể, > 3 từ): tìm ngay và lock.
    - Generic keyword (brand/loại chung, <= 3 từ): trả về generic_parts để vòng lặp build xử lý.
    Trả về:
      - locked: dict {category: doc} các linh kiện đã lock
      - compat_info: thông tin tương thích từ linh kiện đã lock
      - generic_parts: dict {resolved_cat: keyword} các linh kiện chung chung để enrich trong build loop
    """
    locked: Dict[str, Any] = {}
    compat_info: Dict[str, Any] = {}
    generic_parts: Dict[str, str] = {}

    for category, keyword in preferred_parts.items():
        cat_norm = category.strip().lower()
        # Chuẩn hóa category về key trong CATEGORY_KEYWORDS
        resolved_cat = None
        for cat, keywords in CATEGORY_KEYWORDS.items():
            if cat_norm == cat or cat_norm in keywords:
                resolved_cat = cat
                break
        if not resolved_cat:
            resolved_cat = cat_norm

        keyword_clean = keyword.strip()

        # Nếu keyword chung chung → để build loop xử lý với enriched query
        if _is_generic_keyword(keyword_clean):
            print(f"[preferred] Generic keyword '{keyword_clean}' for '{resolved_cat}' -> will enrich in build loop")
            generic_parts[resolved_cat] = keyword_clean
            continue

        # Specific keyword → tìm ngay và lock
        docs = ranked_search(keyword_clean, {"category": resolved_cat}, k=10)
        if docs:
            chosen = docs[0]
            locked[resolved_cat] = chosen
            update_compat_info(compat_info, chosen, resolved_cat)
            print(f"[preferred] Locked {resolved_cat}: {doc_name(chosen)} - {vnd(doc_price(chosen))}")
        else:
            print(f"[preferred] Không tìm thấy '{keyword_clean}' cho category '{resolved_cat}'")

    return locked, compat_info, generic_parts


def _extract_mm(value: str) -> Optional[float]:
    """Trích xuất giá trị số mm từ chuỗi như '267 mm', '400 mm / 15.748\"', '15.748\"'."""
    # Ưu tiên tìm giá trị mm trước
    m = re.search(r"([\d]+(?:[.,]\d+)?)\s*mm", str(value), re.IGNORECASE)
    if m:
        return float(m.group(1).replace(",", "."))
    # Fallback: tìm số bất kỳ đầu tiên
    m = re.search(r"([\d]+(?:[.,]\d+)?)", str(value))
    if m:
        return float(m.group(1).replace(",", "."))
    return None


def filter_docs_by_compat(
    docs: List[Any],
    category: str,
    compat_info: Dict[str, Any],
    selected_categories: List[str],
) -> List[Any]:
    """
    Lọc danh sách docs theo điều kiện tương thích dựa trên COMPATIBILITY_ATTRS và compat_info.
    Chỉ giữ lại các doc mà attrs_json của chúng khớp với ràng buộc tương thích từ các linh kiện đã chọn.
    Nếu không có ràng buộc nào hoặc không có doc nào vượt qua bộ lọc, trả về danh sách gốc.

    Logic so sánh theo từng loại constraint:
    - Socket / Memory Type : contains (case-insensitive)
    - Form Factor          : mainboard FF phải xuất hiện trong danh sách FF case hỗ trợ
    - Length               : GPU length (mm) phải <= case Maximum Video Card Length (mm)
    """
    required: Dict[str, str] = {}
    for src_cat in selected_categories:
        constraint_keys = COMPATIBILITY_ATTRS.get((src_cat, category), [])
        for ck in constraint_keys:
            if ck in ["Socket", "Socket/CPU", "CPU Socket"] and "Socket" in compat_info:
                required["Socket"] = compat_info["Socket"]
            elif ck in ["Memory Type", "Type"] and "Memory Type" in compat_info:
                required["Memory Type"] = compat_info["Memory Type"]
            elif ck in ["Form Factor", "Motherboard Form Factor"] and "Form Factor" in compat_info:
                required["Form Factor"] = compat_info["Form Factor"]
            elif ck in ["Length", "Maximum Video Card Length"] and "Length" in compat_info:
                required["Length"] = compat_info["Length"]

    if not required:
        return docs

    ATTR_ALIASES: Dict[str, List[str]] = {
        "Socket":      ["Socket", "Socket/CPU", "CPU Socket"],
        "Memory Type": ["Memory Type", "Type"],
        "Form Factor": ["Form Factor", "Motherboard Form Factor"],
        "Length":      ["Length", "Maximum Video Card Length"],
    }

    def doc_matches(doc: Any) -> bool:
        attrs_str = getattr(doc, "metadata", {}).get("attrs_json", "{}")
        try:
            attrs = json.loads(attrs_str)
        except Exception:
            return True  # không parse được → không loại

        for compat_key, expected_val in required.items():
            aliases = ATTR_ALIASES.get(compat_key, [compat_key])
            actual_val = None
            for alias in aliases:
                if alias in attrs:
                    actual_val = attrs[alias]
                    break
            if actual_val is None:
                continue  # thiếu attr → không loại

            exp_str = str(expected_val).strip()
            act_str = str(actual_val).strip()

            # --- Length: so sánh số mm (GPU length <= Case max length) ---
            if compat_key == "Length":
                gpu_mm = _extract_mm(exp_str)
                case_max_mm = _extract_mm(act_str)
                if gpu_mm is not None and case_max_mm is not None:
                    if gpu_mm > case_max_mm:
                        # print(
                        #     f"  [compat filter] Loại '{doc_name(doc)}': "
                        #     f"GPU length {gpu_mm}mm > case max {case_max_mm}mm ('{act_str}')"
                        # )
                        return False
                # Nếu không parse được số → bỏ qua (an toàn)
                continue

            # --- Form Factor: kiểm tra mainboard FF nằm trong danh sách case hỗ trợ ---
            if compat_key == "Form Factor":
                if exp_str.lower() not in act_str.lower():
                    # print(
                    #     f"  [compat filter] Loại '{doc_name(doc)}': "
                    #     f"Form Factor '{exp_str}' không nằm trong '{act_str}'"
                    # )
                    return False
                continue

            # --- Socket / Memory Type: contains (case-insensitive) ---
            if exp_str.lower() not in act_str.lower():
                # print(
                #     f"  [compat filter] Loại '{doc_name(doc)}': "
                #     f"{compat_key} = '{act_str}' không chứa '{exp_str}'"
                # )
                return False

        return True

    filtered = [d for d in docs if doc_matches(d)]
    if not filtered:
        print(f"  [compat filter] Không có doc nào vượt qua bộ lọc cho {category}, dùng danh sách gốc.")
        return docs  # fallback
    print(f"  [compat filter] {category}: giữ {len(filtered)}/{len(docs)} docs sau khi lọc.")
    return filtered


def build_pc_recommendation(
    budget: int,
    purpose: str = "gaming",
    preferred_parts: Optional[Dict[str, str]] = None,
) -> str:
    allocation_by_purpose = {
        "gaming": {
            "cpu": 0.23,
            "mainboard": 0.12,
            "cpu_cooler": 0.04,
            "gpu": 0.36,
            "ram": 0.10,
            "storage": 0.07,
            "psu": 0.05,
            "case": 0.03,
        },
        "office": {
            "cpu": 0.31,
            "mainboard": 0.15,
            "cpu_cooler": 0.05,
            "gpu": 0.12,
            "ram": 0.15,
            "storage": 0.13,
            "psu": 0.06,
            "case": 0.03,
        },
        "workstation": {
            "cpu": 0.28,
            "mainboard": 0.13,
            "cpu_cooler": 0.05,
            "gpu": 0.25,
            "ram": 0.12,
            "storage": 0.08,
            "psu": 0.05,
            "case": 0.04,
        },
        "creator": {
            "cpu": 0.26,
            "mainboard": 0.12,
            "cpu_cooler": 0.05,
            "gpu": 0.28,
            "ram": 0.12,
            "storage": 0.10,
            "psu": 0.04,
            "case": 0.03,
        },
    }
    allocation = allocation_by_purpose.get(purpose, allocation_by_purpose["gaming"])
    category_budget = {key: int(budget * ratio) for key, ratio in allocation.items()}
    print("category_budget",category_budget)
    query_hints_by_purpose = {
        "gaming": {
            "cpu": "latest high performance gaming cpu",
            "mainboard": "gaming mainboard",
            "cpu_cooler": "high performance air cooler liquid cooler",
            "gpu": "lastest, modern gpu for gaming",
            "ram": "high bus low latency gaming ram",
            "storage": "high speed nvme ssd for gaming",
            "psu": "stable high wattage power supply",
            "case": "good airflow cooling case",
        },
        "office": {
            "cpu": "modern newest power efficient cpu",
            "mainboard": "durable budget mainboard",
            "cpu_cooler": "quiet budget air cooler",
            "gpu": "budget basic display gpu",
            "ram": "stable office ram",
            "storage": "sata nvme office ssd",
            "psu": "stable moderate wattage power supply",
            "case": "compact simple office case",
        },
        "workstation": {
            "cpu": "high performance multi-core workstation cpu",
            "mainboard": "durable premium workstation mainboard",
            "cpu_cooler": "durable premium aio liquid air cooler",
            "gpu": "professional deep cuda compute workstation gpu",
            "ram": "large capacity 32gb or 64gb ram",
            "storage": "professional large capacity high endurance nvme ssd",
            "psu": "ultra durable gold platinum high wattage power supply",
            "case": "spacious sturdy good cooling case",
        },
        "creator": {
            "cpu": "video rendering photo editing creator cpu",
            "mainboard": "stable high quality mainboard",
            "cpu_cooler": "good cooling aio air cooler rgb for rendering",
            "gpu": "large vram rendering modeling gpu",
            "ram": "high bus creator graphic design ram",
            "storage": "ultra fast read write speed nvme ssd for large files",
            "psu": "stable high performance power supply",
            "case": "good airflow liquid cooling supported case",
        },
    }
    query_hint = query_hints_by_purpose.get(purpose, query_hints_by_purpose["gaming"])
    categories = ["cpu", "mainboard", "gpu", "ram", "storage", "cpu_cooler", "psu", "case"]
    selected_parts: List[Any] = []
    estimated_spent = 0
    compat_info: Dict[str, Any] = {}

    # --- Xử lý linh kiện người dùng chỉ định ---
    locked: Dict[str, Any] = {}
    generic_parts: Dict[str, str] = {}
    if preferred_parts:
        locked, compat_info, generic_parts = resolve_preferred_parts(preferred_parts)
        # Tính chi phí và thêm các linh kiện đã khóa
        for cat, doc in locked.items():
            estimated_spent += doc_price(doc) or 0

    # --- Tính lại ngân sách cho các category còn lại ---
    # Cả locked lẫn generic_parts đều không tính vào remaining để phân bổ lại
    pinned_cats = set(locked.keys())
    remaining_categories = [c for c in categories if c not in pinned_cats]
    remaining_budget = max(budget - estimated_spent, 0)
    print(remaining_budget)
    # Phân bổ lại ngân sách còn lại cho các category chưa được pin
    if remaining_categories:
        total_remaining_ratio = sum(allocation.get(c, 0) for c in remaining_categories)
        if total_remaining_ratio > 0:
            for c in remaining_categories:
                category_budget[c] = int(remaining_budget * (allocation.get(c, 0) / total_remaining_ratio))
        else:
            equal_share = remaining_budget // len(remaining_categories)
            for c in remaining_categories:
                category_budget[c] = equal_share

    for idx, category in enumerate(categories):
        # Nếu category đã được khóa (specific keyword), thêm và bỏ qua
        if category in locked:
            selected_parts.append(locked[category])
            continue
        target = category_budget[category]
        remaining_cats = [c for c in categories[idx + 1:] if c not in locked]
        reserve_for_remaining = sum(int(category_budget[c] * 0.70) for c in remaining_cats)
        remaining_budget_now = max(budget - estimated_spent, 0)

        dynamic_cap = min(
            int(target * 1.25),
            max(remaining_budget_now - reserve_for_remaining, int(target * 0.80)),
        )
        dynamic_cap = max(dynamic_cap, int(target * 0.80))

        # Nếu category có generic keyword → enrich query = keyword + query_hint
        if category in generic_parts:
            query = f"{generic_parts[category]} {query_hint[category]}"
            print(f"[build] Generic preferred '{generic_parts[category]}' enriched to: '{query}'")
        else:
            query = query_hint[category]

        if category == "cpu":
            if "Socket" in compat_info: query += f" Socket : {compat_info['Socket']}"
        if category == "mainboard":
            if "Socket" in compat_info: query += f" Socket/CPU : {compat_info['Socket']}"
            if "Memory Type" in compat_info: query += f" Memory Type : {compat_info['Memory Type']}"
        elif category == "cpu_cooler":
            if "Socket" in compat_info: query += f" CPU Socket : {compat_info['Socket']}"
        elif category == "ram":
            if "Memory Type" in compat_info: query += f" Memory Type : {compat_info['Memory Type']}"
        elif category == "case":
            if "Form Factor" in compat_info: query += f" Form Factor : {compat_info['Form Factor']}"
            if "Length" in compat_info: query += f" VGA Card Length : {compat_info['Length']}"
        print("Query:", query)
        docs = ranked_search(query, {"category": category}, k=50)

        # --- Lọc tương thích bằng Python trên attrs_json ---
        selected_categories_so_far = [doc_category(d) for d in selected_parts]
        docs = filter_docs_by_compat(docs, category, compat_info, selected_categories_so_far)
        print(category,"target:",target,"dynamic_cap:",dynamic_cap)
        chosen = choose_doc_by_budget(docs, target_price=target, max_price=dynamic_cap)
        print
        if chosen:
            selected_parts.append(chosen)
            estimated_spent += doc_price(chosen) or target
            update_compat_info(compat_info, chosen, category)

    selected_parts = dedupe_docs(selected_parts)
    if not selected_parts:
        return "Không tìm được cấu hình phù hợp với ngân sách hiện tại."

    lines = [f"Đề xuất cấu hình theo ngân sách {vnd(budget)}:"]
    for idx, doc in enumerate(selected_parts, start=1):
        product_id = doc_uid(doc)
        cat = doc_category(doc)
        lines.append(
            (
                f"{idx}. [{doc_name(doc)}] | product_id={product_id} |"
                f"category={doc_category(doc)} | {vnd(doc_price(doc))}"
            )
        )

    total_cost = sum(doc_price(doc) or 0 for doc in selected_parts)
    lines.append(f"\nTổng chi phí ước tính: {vnd(total_cost)}")
    return "\n".join(lines)

def doc_filtered_attrs(doc: Any) -> str:
    metadata = getattr(doc, "metadata", {}) or {}
    attrs_str = metadata.get("attrs_json", "{}")
    category = metadata.get("category", "")
    try:
        attrs = json.loads(attrs_str)
    except Exception:
        attrs = {}
        
    if category in COMPARE_ATTRS:
        filtered = {k: v for k, v in attrs.items() if k in COMPARE_ATTRS[category]}
        return json.dumps(filtered, ensure_ascii=False)
    
    return attrs_str

def extract_product_ids_from_text(text: str) -> List[str]:
    product_ids = re.findall(r"/product-info/([^\)\s]+)", text or "")
    return list(dict.fromkeys(product_ids))


def build_json_response(message: str, intent: str = "") -> str:
    product_ids = extract_product_ids_from_text(message)
    product_groups = []
    if product_ids:
        product_groups.append({
            "label": "",
            "order": 1,
            "product_ids": product_ids,
        })
    payload = {
        "message": message,
        "product_groups": product_groups,
        "intent": intent,
    }
    return json.dumps(payload, ensure_ascii=False)
# =====================================================
# TOOLS
# =====================================================

@tool
def search_products(keyword: str = "", category: str = "", limit: int = 5, purpose: str = "") -> str:
    """Tìm sản phẩm theo từ khóa(keyword) và/hoặc loại linh kiện(category). Cả 2 đều có thể để trống nếu chỉ cần tìm theo 1 trong 2. Tham số purpose (tùy chọn) mô tả mục đích tìm kiếm của người dùng."""
    keyword = (keyword or "").strip()
    category = (category or "").strip().lower()
    purpose = (purpose or "").strip()
    
    if purpose:
        print(f"[Tool: search_products] User purpose: {purpose}")

    if not keyword and not category:
        return "Vui lòng cung cấp từ khóa hoặc loại sản phẩm."

    filters = {"category": category} if category else None
    query = keyword if keyword else category
    if purpose:
        query = f"{query} {purpose}".strip()

    docs = ranked_search(query, filters, k=max(1, min(limit, 10)))
    docs = docs[: max(1, min(limit, 10))]
    
    if not docs:
        if keyword and category:
            return f"Không tìm thấy sản phẩm nào loại '{category}' với từ khóa '{keyword}'."
        elif keyword:
            return f"Không tìm thấy sản phẩm nào với từ khóa '{keyword}'."
        else:
            return f"Không tìm thấy sản phẩm loại '{category}'."

    return build_context_block(docs)


@tool
def search_products_by_budget(target_price: int, keyword: str = "", product_type: str = "", limit: int = 5, purpose: str = "") -> str:
    """
    Tìm sản phẩm gần với ngân sách mục tiêu của người dùng (target_price), loại sản phẩm (product_type) và từ khóa (keyword). Tham số purpose (tùy chọn) mô tả mục đích tìm kiếm của người dùng.
    """
    purpose = (purpose or "").strip()
    if purpose:
        print(f"[Tool: search_products_by_budget] User purpose: {purpose}")

    if target_price <= 0:
        return "Ngân sách phải lớn hơn 0."

    min_price = int(target_price * 0.8)
    max_price = int(target_price * 1.1)

    filters = build_filter(
        product_type=product_type,
        min_price=min_price,
        max_price=max_price
    )

    query = f"{keyword}"
    if purpose:
        query = f"{query} {purpose}".strip()

    docs = ranked_search(query, filters or None, k=max(limit * 3, 20))

    if not docs:
        return "Không tìm thấy sản phẩm."


    docs = docs[: max(1, min(limit, 20))]

    if not docs:
        return "Không tìm thấy sản phẩm phù hợp với ngân sách."

    return build_context_block(docs)
@tool
def recommend_pc_build(budget: int, purpose: str = "gaming", preferred_parts: Optional[Dict[str, str]] = None) -> str:
    """
    Gợi ý cấu hình PC cân đối theo ngân sách và mục đích sử dụng (purpose: gaming, office, workstation, creator).
    Nếu người dùng chỉ định linh kiện cụ thể, truyền preferred_parts là dict với key là loại linh kiện (cpu, gpu, ram, mainboard, cpu_cooler, storage, psu, case) và value là tên/từ khóa linh kiện.
    Ví dụ: preferred_parts={"cpu": "AMD Ryzen 7 7800X3D", "gpu": "RTX 4060"}
    Các category còn lại sẽ được tự động chọn phù hợp với ngân sách và tương thích.
    """
    if budget <= 0:
        return "Ngân sách phải lớn hơn 0."

    return build_pc_recommendation(budget=budget, purpose=purpose, preferred_parts=preferred_parts)


@tool
def get_available_types() -> str:
    """Tra ve cac loai linh kien co the tim."""
    types = sorted(CATEGORY_KEYWORDS.keys())
    return "Các loại sản phẩm hiện có: " + ", ".join(types)

@tool
def compare_products(product_names: List[str]) -> str:
    """So sánh các sản phẩm dựa vào các thông số quan trọng của chúng. Trả về thông tin chi tiết và thông số kỹ thuật của các sản phẩm để so sánh. Cung cấp danh sách tên sản phẩm hoặc từ khóa (tối đa 5 sản phẩm)."""
    if len(product_names) > 5:
        return "Chỉ hỗ trợ so sánh tối đa 5 sản phẩm cùng lúc."
        
    if not product_names:
        return "Vui lòng cung cấp danh sách tên sản phẩm để so sánh."
        
    docs = []
    for q in product_names:
        found = ranked_search(q, filters=None, k=1)
        if found:
            docs.append(found[0])
            
    if not docs:
        return "Không tìm thấy sản phẩm nào để so sánh."
        
    categories = set(doc_category(doc) for doc in docs)
    if len(categories) > 1:
        return f"Các sản phẩm không cùng loại (tìm thấy: {', '.join(categories)}). Chỉ hỗ trợ so sánh các sản phẩm cùng loại."
        
    lines = []
    for idx, doc in enumerate(docs, start=1):
        product_id = doc_uid(doc)
        attrs = doc_filtered_attrs(doc)
        line = (
            f"Sản phẩm {idx}: {doc_name(doc)} | "
            f"category={doc_category(doc)} | price={vnd(doc_price(doc))} | product_id={product_id} | "
            f"Thông số: {attrs}"
        )
        lines.append(line)
        
    return "\n".join(lines)


@tool
def find_compatible_products(provided_products: List[str], target_categories: List[str], target_keywords: List[str] = None) -> str:
    """
    Tìm kiếm các sản phẩm tương thích với cấu hình hiện có (provided_products).
    Cung cấp target_categories (bắt buộc, ví dụ: ["mainboard", "cpu_cooler"]) và target_keywords (tùy chọn, để tìm chi tiết hơn, ví dụ: ["mainboard wifi", "tản nhiệt nước"]).
    Nếu không có từ khóa chi tiết, có thể để trống target_keywords hoặc truyền chuỗi rỗng.
    """
    base_docs = []
    for q in provided_products:
        found = ranked_search(q, filters=None, k=1)
        if found:
            base_docs.append(found[0])
            
    if not base_docs:
        return "Không tìm thấy thông tin cấu hình gốc để kiểm tra tương thích."

    if target_keywords is None:
        target_keywords = [""] * len(target_categories)
    elif len(target_keywords) < len(target_categories):
        target_keywords.extend([""] * (len(target_categories) - len(target_keywords)))

    results = []
    for target_cat, target_kw in zip(target_categories, target_keywords):
        target_cat_norm = target_cat.lower().strip()
        target_kw_norm = target_kw.lower().strip() if target_kw else ""
        
        filter_cat = None
        for cat, keywords in CATEGORY_KEYWORDS.items():
            if target_cat_norm in keywords or target_cat_norm == cat:
                filter_cat = cat
                break
                
        if not filter_cat:
            filter_cat = target_cat_norm
            
        # Trích xuất thông số tương thích dựa trên cặp (source_category, target_category)
        compat_info = {}
        for doc in base_docs:
            cat = doc_category(doc)
            attrs_str = getattr(doc, "metadata", {}).get("attrs_json", "{}")
            try:
                attrs = json.loads(attrs_str)
            except:
                attrs = {}
                
            allowed_keys = COMPATIBILITY_ATTRS.get((cat, filter_cat), [])
            for k, v in attrs.items():
                if k in allowed_keys:
                    if k in ["Socket/CPU", "Socket"]:
                        compat_info["Socket"] = v
                    elif k in ["Type", "Memory Type"]:
                        compat_info["Memory Type"] = v
                    elif k in ["Motherboard Form Factor", "Form Factor"]:
                        compat_info["Form Factor"] = v
                    elif k in ["Length", "Maximum Video Card Length"]:
                        compat_info["Length"] = v
            
        # Use target_kw if available, otherwise use target_cat
        query_parts = [target_kw_norm if target_kw_norm else target_cat_norm]
        
        if filter_cat == "mainboard":
            if "Socket" in compat_info: query_parts.append(f"socket {compat_info['Socket']}")
            if "Memory Type" in compat_info: query_parts.append(f"hỗ trợ {compat_info['Memory Type']}")
        elif filter_cat == "cpu_cooler":
            if "Socket" in compat_info: query_parts.append(f"socket {compat_info['Socket']}")
        elif filter_cat == "ram":
            if "Memory Type" in compat_info: query_parts.append(f"{compat_info['Memory Type']}")
        elif filter_cat == "cpu":
            if "Socket" in compat_info: query_parts.append(f"socket {compat_info['Socket']}")
        elif filter_cat == "case":
            if "Form Factor" in compat_info: query_parts.append(f"hỗ trợ mainboard {compat_info['Form Factor']}")
            if "Length" in compat_info: query_parts.append(f"vga {compat_info['Length']}")
            
        query = " ".join(query_parts)
        
        docs = ranked_search(query, filters={"category": filter_cat} if filter_cat in CATEGORY_KEYWORDS else None, k=5)
        
        if docs:
            display_name = target_kw_norm if target_kw_norm else target_cat_norm
            results.append(f"\n--- Đề xuất cho {display_name} (Query: '{query}') ---")
            for idx, doc in enumerate(docs, start=1):
                results.append(
                    f"[{idx}] {doc_name(doc)} | price={vnd(doc_price(doc))} | product_id={doc_uid(doc)}\n"
                    # f"Thông số: {doc_filtered_attrs(doc)}"
                )
        else:
            display_name = target_kw_norm if target_kw_norm else target_cat_norm
            results.append(f"\n--- Không tìm thấy {display_name} phù hợp với yêu cầu (Query: '{query}') ---")
            
    return "\n".join(results)


tools = [
    search_products,
    search_products_by_budget,
    recommend_pc_build,
    get_available_types,
    compare_products,
    find_compatible_products,
]


# =====================================================
# AGENT GRAPH
# =====================================================

llm = get_llm()
llm_with_tools = llm.bind_tools(tools, tool_choice="auto")

system_prompt = SystemMessage(
    content="""
Bạn là trợ lý tư vấn cho shop linh kiện PC.

Quy tắc:
- Chỉ trả lời dựa trên dữ liệu từ tools.
- Trả lời bằng JSON hợp lệ với 3 khóa bắt buộc: "message", "product_groups" và "intent".
- "intent" là ý định ngắn gọn của người dùng (ví dụ: "build pc", "tìm kiếm", "so sánh").
- "message" phải là nội dung markdown ngắn gọn, rõ ràng, không sử dụng icon, có kèm danh sách sản phẩm (không kèm product_id) nếu có. 
- "product_groups" là mảng các nhóm sản phẩm. Mỗi nhóm gồm:
  + "label": tên nhóm (ví dụ: "Mainboard Wi-Fi", "Tản nhiệt nước"), để trống "" nếu không cần tiêu đề nhóm.
  + "order": số thứ tự sắp xếp (nhóm đầu tiên = 1, nhóm thứ hai = 2, ...).
  + "product_ids": danh sách product_id thuộc nhóm đó.
- Hạn chế chia product_groups. Nếu intent là "build pc" hoặc chỉ có 1 danh sách sản phẩm đơn, chỉ dùng 1 product_group duy nhất với label rỗng.
- Chỉ chia nhiều product_groups khi kết quả thực sự thuộc các nhóm/category khác nhau rõ ràng (ví dụ: tìm tương thích cho nhiều loại linh kiện).
- Nếu không có sản phẩm, trả "product_groups": [].
- Nếu người dùng hỏi chung về loại sản phẩm hoặc tìm kiếm sản phẩm, dùng get_available_types hoặc search_products.
- Nếu người dùng yêu cầu so sánh sản phẩm, dùng compare_products, thêm một chút nhận xét cho mỗi thông số được so sánh, và kết luận ngắn gọn cuối cùng.
- Nếu người dùng yêu cầu tìm sản phẩm tương thích với sản phẩm người dùng đưa ra, dùng find_compatible_products.
- Nếu có ngân sách, dùng search_products_by_budget.
- Nếu người dùng muốn build PC, hãy hỏi thêm nếu thiếu ngân sách hoặc nhu cầu (gaming, office, workstation, creator), và thêm một câu nhận xét ngắn gọn sau khi nhận câu trả lời.
- Nếu người dùng yêu cầu build PC và chỉ định linh kiện cụ thể (ví dụ: "build PC dùng Ryzen 7 và RTX 4060"), hãy truyền preferred_parts cho recommend_pc_build với key là category (cpu, gpu, ram, mainboard, cpu_cooler, storage, psu, case) và value là tên/từ khóa linh kiện người dùng đưa ra.
- Khi đã có đủ dữ liệu, trả lời ngắn gọn, rõ ràng, ưu tiên dạng danh sách.
""".strip()
)


def agent_node(state: AgentState):
    messages = [system_prompt] + state["messages"]
    try:
        response = llm_with_tools.invoke(messages)
        print("LLM response:", response)
        return {"messages": [response]}
    except Exception as e:
        print("❌ ERROR in agent_node:", str(e))
        fallback_message = "Xin lỗi, tôi đã gặp lỗi khi xử lý yêu cầu của bạn. Vui lòng thử lại sau."
        return {"messages": [AIMessage(content=fallback_message)]}
        


def format_node(state: AgentState):
    messages = state.get("messages", [])
    if not messages:
        return {"messages": []}

    last_message = messages[-1]
    content = getattr(last_message, "content", "")
    if not content:
        return {"messages": []}

    # Xử lý format Gemini: content là list với {'type': 'thinking'} và {'type': 'text'}
    if isinstance(content, list):
        text_content = ""
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                text_content = item.get("text", "")
                break
        content_str = text_content.strip()
    else:
        content_str = str(content).strip()
    
    if not content_str:
        return {"messages": []}
    
    # Extract JSON từ markdown code block nếu có
    json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', content_str, re.DOTALL)
    if json_match:
        content_str = json_match.group(1).strip()
    
    # Helper: chuyển đổi format cũ (product_ids) sang format mới (product_groups)
    def _migrate_to_groups(parsed):
        if "product_groups" not in parsed and "product_ids" in parsed:
            pids = parsed.pop("product_ids", [])
            if pids:
                parsed["product_groups"] = [{"label": "", "order": 1, "product_ids": list(pids)}]
            else:
                parsed["product_groups"] = []
        if "intent" not in parsed:
            parsed["intent"] = ""
        return parsed

    # Thử parse JSON từ content
    try:
        parsed = json.loads(content_str)
        if isinstance(parsed, dict) and "message" in parsed:
            if "product_groups" in parsed or "product_ids" in parsed:
                parsed = _migrate_to_groups(parsed)
                formatted = json.dumps(parsed, ensure_ascii=False)
                return {"messages": [AIMessage(content=formatted)]}
    except (json.JSONDecodeError, ValueError):
        pass
    
    # Nếu không phải JSON hợp lệ, ép nó về format chuẩn
    # Extract product_ids từ content (tìm pattern [1, 2, 3] hoặc product_id: [...])
    product_ids = extract_product_ids_from_text(content_str)
    
    # Tìm product_id list trong format [1, 2, 3] hoặc product_id: [1, 2, 3]
    id_list_pattern = r'\[[\d\s,]+\]'
    id_matches = re.findall(id_list_pattern, content_str)
    if id_matches:
        try:
            for match in id_matches:
                extracted = re.findall(r'\d+', match)
                if extracted:
                    product_ids.extend(extracted)
        except Exception:
            pass
    
    product_ids = list(dict.fromkeys(product_ids))  # Dedup
    
    # Lấy message bằng cách remove product_id list pattern
    message = re.sub(id_list_pattern, '', content_str).strip()
    message = re.sub(r'product_id\s*:\s*\[[\d\s,]+\]', '', message).strip()
    message = message or content_str
    
    product_groups = []
    if product_ids:
        product_groups.append({"label": "", "order": 1, "product_ids": product_ids})

    formatted_json = json.dumps({
        "message": message,
        "product_groups": product_groups,
        "intent": ""
    }, ensure_ascii=False)
    
    return {"messages": [AIMessage(content=formatted_json)]}


workflow = StateGraph(AgentState)
workflow.add_node("agent", agent_node)
workflow.add_node("tools", ToolNode(tools))
workflow.add_node("format_node", format_node)

workflow.add_edge(START, "agent")
workflow.add_conditional_edges(
    "agent",
    tools_condition,
    {"tools": "tools", "__end__": "format_node"},
)
workflow.add_edge("tools", "agent")
workflow.add_edge("format_node", END)

app = workflow.compile()


def create_pc_product_agent():
    return app
