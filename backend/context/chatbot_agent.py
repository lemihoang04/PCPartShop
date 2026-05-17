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
    
    ("cpu_cooler", "cpu"): ["Socket/CPU", "Socket"],
    ("cpu_cooling", "cpu"): ["Socket/CPU", "Socket"],
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
            if bm25_retriever:
                vector_docs = db.similarity_search(q, k=k, filter=filters if filters else None)
                
                bm25_retriever.k = max(k * 3, 20)
                bm25_docs_unfiltered = bm25_retriever.invoke(q)
                
                if filters:
                    bm25_docs = [d for d in bm25_docs_unfiltered if check_filter_match(d, filters)]
                else:
                    bm25_docs = bm25_docs_unfiltered
                
                rrf_score = {}
                doc_map = {}
                
                for r, doc in enumerate(vector_docs):
                    uid = doc_uid(doc)
                    rrf_score[uid] = rrf_score.get(uid, 0.0) + (1.0 / (r + 60))
                    doc_map[uid] = doc
                    
                for r, doc in enumerate(bm25_docs):
                    uid = doc_uid(doc)
                    rrf_score[uid] = rrf_score.get(uid, 0.0) + (1.0 / (r + 50)) * 0.9
                    doc_map[uid] = doc
                
                sorted_docs = sorted(rrf_score.items(), key=lambda x: x[1], reverse=True)
                docs = [doc_map[uid] for uid, score in sorted_docs[:k]]
                
                results.extend(docs)
            else:
                docs = db.similarity_search(q, k=k, filter=filters if filters else None)
                results.extend(docs)
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

    priced_candidates: List[Dict[str, Any]] = []
    for idx, doc in enumerate(docs):
        price = doc_price(doc)
        if price is None:
            continue
        priced_candidates.append({"doc": doc, "price": price, "rank": idx})

    if priced_candidates:
        within_budget = [item for item in priced_candidates if item["price"] <= max_price]
        pool = within_budget if within_budget else priced_candidates

        def score(item: Dict[str, Any]) -> float:
            price = int(item["price"])
            rank = int(item["rank"])
            distance = abs(price - target_price) / max(target_price, 1)
            over_target_penalty = 0.12 if price > target_price else 0.0
            rank_penalty = rank * 0.03
            return distance + over_target_penalty + rank_penalty

        return min(pool, key=score)["doc"]

    return docs[0]


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
        elif k in ["Motherboard Form Factor", "Form Factor"]:
            if "Form Factor" not in compat_info:
                compat_info["Form Factor"] = v
        elif k in ["Length", "Maximum Video Card Length"]:
            if "Length" not in compat_info:
                compat_info["Length"] = v


def resolve_preferred_parts(
    preferred_parts: Dict[str, str],
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Tìm kiếm linh kiện mà người dùng chỉ định (preferred_parts).
    Trả về:
      - locked: dict {category: doc} cho các linh kiện tìm được
      - compat_info: thông tin tương thích trích xuất từ linh kiện đã khóa
    """
    locked: Dict[str, Any] = {}
    compat_info: Dict[str, Any] = {}

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

        docs = ranked_search(keyword.strip(), {"category": resolved_cat}, k=5)
        if docs:
            chosen = docs[0]  # Lấy kết quả phù hợp nhất
            locked[resolved_cat] = chosen
            update_compat_info(compat_info, chosen, resolved_cat)
            print(f"[preferred] Locked {resolved_cat}: {doc_name(chosen)} - {vnd(doc_price(chosen))}")
        else:
            print(f"[preferred] Không tìm thấy '{keyword}' cho category '{resolved_cat}'")

    return locked, compat_info


def build_pc_recommendation(
    budget: int,
    priority: str = "balance",
    preferred_parts: Optional[Dict[str, str]] = None,
) -> str:
    allocation_by_priority = {
        "fps": {
            "cpu": 0.22,
            "mainboard": 0.13,
            "gpu": 0.39,
            "ram": 0.10,
            "storage": 0.07,
            "psu": 0.05,
            "case": 0.04,
        },
        "productivity": {
            "cpu": 0.30,
            "mainboard": 0.14,
            "gpu": 0.27,
            "ram": 0.12,
            "storage": 0.08,
            "psu": 0.05,
            "case": 0.04,
        },
        "silent": {
            "cpu": 0.24,
            "mainboard": 0.14,
            "gpu": 0.32,
            "ram": 0.10,
            "storage": 0.08,
            "psu": 0.06,
            "case": 0.06,
        },
        "balance": {
            "cpu": 0.25,
            "mainboard": 0.14,
            "gpu": 0.35,
            "ram": 0.10,
            "storage": 0.07,
            "psu": 0.05,
            "case": 0.04,
        },
    }
    allocation = allocation_by_priority.get(priority, allocation_by_priority["balance"])
    category_budget = {key: int(budget * ratio) for key, ratio in allocation.items()}

    query_hint = {
        "cpu": "cpu hiệu năng tốt",
        "mainboard": "mainboard",
        "gpu": "gpu mạnh cho gaming 1080p/2k",
        "ram": "ram 16gb hoặc 32gb độ trễ tốt",
        "storage": "ssd nvme tốc độ cao",
        "psu": "psu chất lượng 80 plus, công suất đủ",
        "case": "case airflow tốt, dễ lắp ráp",
    }
    categories = ["mainboard", "cpu", "gpu", "ram", "storage", "psu", "case"]
    selected_parts: List[Any] = []
    estimated_spent = 0
    compat_info: Dict[str, Any] = {}

    # --- Xử lý linh kiện người dùng chỉ định ---
    locked: Dict[str, Any] = {}
    if preferred_parts:
        locked, compat_info = resolve_preferred_parts(preferred_parts)
        # Tính chi phí và thêm các linh kiện đã khóa
        for cat, doc in locked.items():
            estimated_spent += doc_price(doc) or 0

    # --- Tính lại ngân sách cho các category còn lại ---
    remaining_categories = [c for c in categories if c not in locked]
    remaining_budget = max(budget - estimated_spent, 0)

    # Phân bổ lại ngân sách còn lại cho các category chưa được khóa
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
        # Nếu category đã được khóa bởi preferred_parts, thêm và bỏ qua
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

        query = query_hint[category]
        if category == "cpu":
            if "Socket" in compat_info: query += f" socket {compat_info['Socket']}"
        if category == "mainboard":
            if "Socket" in compat_info: query += f" socket {compat_info['Socket']}"
            if "Memory Type" in compat_info: query += f" hỗ trợ {compat_info['Memory Type']}"
        elif category == "ram":
            if "Memory Type" in compat_info: query += f" {compat_info['Memory Type']}"
        elif category == "case":
            if "Form Factor" in compat_info: query += f" hỗ trợ mainboard {compat_info['Form Factor']}"
            if "Length" in compat_info: query += f" vga {compat_info['Length']}"
        print("Query:", query)
        docs = ranked_search(query, {"category": category}, k=10)
        chosen = choose_doc_by_budget(docs, target_price=target, max_price=dynamic_cap)
        
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
        is_locked = doc_category(doc) in locked
        lock_marker = " (người dùng chỉ định)" if is_locked else ""
        lines.append(
            (
                f"{idx}. [{doc_name(doc)}] | product_id={product_id} |"
                f"{doc_category(doc)} | {vnd(doc_price(doc))}{lock_marker}"
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


def build_json_response(message: str) -> str:
    payload = {
        "message": message,
        "product_ids": extract_product_ids_from_text(message),
    }
    return json.dumps(payload, ensure_ascii=False)
# =====================================================
# TOOLS
# =====================================================

@tool
def search_products(keyword: str = "", category: str = "", limit: int = 5) -> str:
    """Tìm sản phẩm theo từ khóa(keyword) và/hoặc loại linh kiện(category). Cả 2 đều có thể để trống nếu chỉ cần tìm theo 1 trong 2."""
    keyword = (keyword or "").strip()
    category = (category or "").strip().lower()

    if not keyword and not category:
        return "Vui lòng cung cấp từ khóa hoặc loại sản phẩm."

    filters = {"category": category} if category else None
    query = keyword if keyword else category

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
def search_products_by_budget(target_price: int, keyword: str = "", product_type: str = "", limit: int = 5) -> str:
    """
    Tìm sản phẩm gần với ngân sách mục tiêu của người dùng (target_price), loại sản phẩm (product_type) và từ khóa (keyword).
    """

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

    docs = ranked_search(query, filters or None, k=max(limit * 3, 20))

    if not docs:
        return "Không tìm thấy sản phẩm."


    docs = docs[: max(1, min(limit, 20))]

    if not docs:
        return "Không tìm thấy sản phẩm phù hợp với ngân sách."

    return build_context_block(docs)
@tool
def recommend_pc_build(budget: int, priority: str = "balance", preferred_parts: Optional[Dict[str, str]] = None) -> str:
    """
    Gợi ý cấu hình PC cân đối theo ngân sách và mục tiêu sử dụng.
    Nếu người dùng chỉ định linh kiện cụ thể, truyền preferred_parts là dict với key là loại linh kiện (cpu, gpu, ram, mainboard, storage, psu, case) và value là tên/từ khóa linh kiện.
    Ví dụ: preferred_parts={"cpu": "AMD Ryzen 7 7800X3D", "gpu": "RTX 4060"}
    Các category còn lại sẽ được tự động chọn phù hợp với ngân sách và tương thích.
    """
    if budget <= 0:
        return "Ngân sách phải lớn hơn 0."

    return build_pc_recommendation(budget=budget, priority=priority, preferred_parts=preferred_parts)


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
- Trả lời bằng JSON hợp lệ với 2 khóa bắt buộc: "message" và "product_ids".
- "message" phải là nội dung markdown ngắn gọn, rõ ràng, không sử dụng icon, có kèm danh sách sản phẩm (không kèm product_id) nếu có. 
- "product_ids" là danh sách product_id lấy từ các sản phẩm phù hợp; nếu không có sản phẩm thì trả về [].
- Nếu người dùng hỏi chung về loại sản phẩm hoặc tìm kiếm sản phẩm, dùng get_available_types hoặc search_products.
- Nếu người dùng yêu cầu so sánh sản phẩm, dùng compare_products, thêm một chút nhận xét cho mỗi thông số được so sánh, và kết luận ngắn gọn cuối cùng.
- Nếu người dùng yêu cầu tìm sản phẩm tương thích với sản phẩm người dùng đưa ra, dùng find_compatible_products.
- Nếu có ngân sách, dùng search_products_by_budget hoặc recommend_pc_build.
- Nếu người dùng muốn build PC, hãy hỏi thêm nếu thiếu ngân sách hoặc nhu cầu.
- Nếu người dùng yêu cầu build PC và chỉ định linh kiện cụ thể (ví dụ: "build PC dùng Ryzen 7 và RTX 4060"), hãy truyền preferred_parts cho recommend_pc_build với key là category (cpu, gpu, ram, mainboard, storage, psu, case) và value là tên/từ khóa linh kiện người dùng đưa ra.
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
    
    # Thử parse JSON từ content
    try:
        parsed = json.loads(content_str)
        # Kiểm tra có đủ keys "message" và "product_ids" không
        if isinstance(parsed, dict) and "message" in parsed and "product_ids" in parsed:
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
            # Cố gắng parse list số từ pattern tìm được
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
    
    formatted_json = json.dumps({
        "message": message,
        "product_ids": product_ids
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
