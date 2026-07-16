from attr import filters
import os
import re
import json
from typing import Annotated, Any, Dict, List, Optional, TypedDict
import csv

from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from context.init_models import db, get_llm, faq_db
from DAL.chatbot_dal import (
    dal_get_faq_by_id, dal_fuzzy_search_game_profile, dal_get_game_tier_requirements,
    dal_fuzzy_search_software_profile, dal_get_software_tier_requirements
)

import pickle
from langchain_community.retrievers import BM25Retriever
from langchain_classic.retrievers import EnsembleRetriever

from context.helper import (
    price_segment, check_filter_match, build_filter, detect_category,
    detect_budget, as_vnd, vnd, doc_name, doc_category, doc_price,
    doc_uid, doc_image, dedupe_docs, build_context_block, format_markdown_output,
    _is_generic_keyword, extract_number, extract_ram_speed, _extract_ddr_type,
    _extract_number, _extract_mm, doc_filtered_attrs, extract_product_ids_from_text,
    build_json_response, _extract_compat_values,
    CATEGORY_KEYWORDS, VITAL_ATTRS, COMPATIBILITY_ATTRS, MIN_BUDGETS_FOR_BUILD_PC, MAX_BUDGETS_FOR_BUILD_PC,
    _COMPAT_KEY_MAP, _COMPAT_KEY_ALIASES
)


# =====================================================
# STATE
# =====================================================

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]


# =====================================================
    
def ranked_search(query: str, filters: Optional[Dict[str, Any]], k: int = 8) -> List[Any]:
    results: List[Any] = []
    try:
        docs_path = os.path.join(os.path.dirname(__file__), "chroma_db", "docs.pkl")
        with open(docs_path, "rb") as f:
            all_docs = pickle.load(f)
        bm25_retriever = BM25Retriever.from_documents(all_docs)
    except Exception as e:
        print(f"Error loading docs.pkl for BM25: {e}")
        bm25_retriever = None

    queries = [
        query,
        # f"sản phẩm phù hợp cho nhu cầu {query}",
        # f"linh kiện pc {query}",
    ]

    for q in queries:
        try:
            if _is_generic_keyword(q):
                print("Generic keyword detected")
                w=0.2
            else: w=0.8
            db_retriever = db.as_retriever(search_kwargs={"k": k, "filter": filters if filters else None})
            if bm25_retriever and all_docs:
                if filters and "category" in filters:
                    target_category = filters["category"]
                    # Chỉ giữ lại các tài liệu có category trùng khớp
                    filtered_docs = [
                        doc for doc in all_docs 
                        if doc.metadata.get("category") == target_category
                    ]
                else:
                    # Nếu không có hoặc không chứa "category", giữ nguyên toàn bộ tài liệu
                    filtered_docs = all_docs
                
                bm25_retriever = BM25Retriever.from_documents(filtered_docs)
                bm25_retriever.k = max(k * 2, 20)
                ensemble_retriever = EnsembleRetriever(
                    retrievers=[bm25_retriever, db_retriever], weights=[w, 1-w]
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
    category: str = None,
    is_pc_build: bool = False,
) -> List[Any]:

    if not docs:
        return []

    if target_price <= 0:
        result = []
        for doc in docs:
            price = doc_price(doc)
            if price and price > 0:
                result.append(doc)
        return result if result else list(docs)

    if target_price > max_price:
        target_price = max_price
        max_price = target_price * 1.1

    candidates: List[Dict[str, Any]] = []

    # 1. Thu thập ứng viên và trích xuất chỉ số CPU/GPU
    for rank, doc in enumerate(docs):
        price = doc_price(doc)
        if price is None or price <= 0:
            continue

        cpu_multi = float(doc.metadata.get('cpu_multi_thread', 0) or 0)
        cpu_single = float(doc.metadata.get('cpu_single_thread', 0) or 0)
        gpu_g3d = float(doc.metadata.get('gpu_g3d', 0) or 0)

        candidates.append({
            "doc": doc,
            "price": int(price),
            "rank": rank,
            "cpu_multi": cpu_multi,
            "cpu_single": cpu_single,
            "gpu_g3d": gpu_g3d
        })

    if not candidates:
        return []

    # 2. Tìm giá trị lớn nhất (Max) của từng chỉ số trong pool để phục vụ chuẩn hóa (Min-Max Normalization)
    max_cpu_multi = max([c["cpu_multi"] for c in candidates]) or 1.0
    max_cpu_single = max([c["cpu_single"] for c in candidates]) or 1.0
    max_gpu_g3d = max([c["gpu_g3d"] for c in candidates]) or 1.0
    min_price = target_price * (0.6 if is_pc_build else 0.9)
    within_budget = [c for c in candidates if c["price"] <= max_price and c["price"] >= min_price]
    extra = []
    if len(within_budget) < 8:
        extra = sorted(
            candidates,
            key=lambda x: abs(x["price"] - target_price)
        )

        seen = {id(x["doc"]) for x in within_budget}

    for item in extra:
        if id(item["doc"]) in seen:
            continue

        within_budget.append(item)

        if len(within_budget) >= 8:
            break
    print("within_budget count:", len(within_budget))
    if not within_budget and not is_pc_build:
        return []
    pool = within_budget if within_budget else candidates

    def score(item: Dict[str, Any]) -> float:
        price, rank = item["price"], item["rank"]

        # 1. PRICE SUITABILITY (0 = tốt nhất)
        distance_score = min(abs(price - target_price) / target_price, 1.0)
        over_budget_score = min(max(price - target_price, 0) / target_price, 1.0)
        price_score = (0.35 * distance_score) + (0.65 * over_budget_score)

        # 2. PERFORMANCE SCORE (0 = tốt nhất)
        norm_cpu_multi = item["cpu_multi"] / max_cpu_multi
        norm_cpu_single = item["cpu_single"] / max_cpu_single
        norm_gpu_g3d = item["gpu_g3d"] / max_gpu_g3d

        doc = item["doc"]
        attrs_dict = json.loads(doc.metadata.get("attrs_json", "{}"))
        performance_bonus = 1.0

        if category == "cpu":
            performance_bonus = (norm_cpu_multi * 0.6) + (norm_cpu_single * 0.4)
        elif category == "gpu":
            performance_bonus = norm_gpu_g3d
        elif category == "storage":
            performance_bonus = 0.6 if attrs_dict.get("NVME", "").lower() == "yes" else 0.0
            interface = attrs_dict.get("Interface", "").lower()
            if "pcie 5" in interface: performance_bonus += 0.4
            elif "pcie 4" in interface: performance_bonus += 0.3
            elif "pcie 3" in interface: performance_bonus += 0.2
        elif category == "ram":
            performance_bonus = 0.0
            speed = extract_ram_speed(attrs_dict.get("Speed", ""))
            latency = extract_number(attrs_dict.get("CAS Latency", ""))
            
            if speed: performance_bonus += min(speed / 6400, 1.0) * 0.4
            if latency: performance_bonus += max(min(1 - latency / 40, 1.0), 0.0) * 0.15

            m = re.search(r"(\d+)\s*x\s*(\d+)", attrs_dict.get("Modules", ""))
            if m:
                module_count, module_size = int(m.group(1)), int(m.group(2))
                total_capacity = module_count * module_size
                performance_bonus += min(total_capacity / 128, 1.0) * 0.3
                performance_bonus += min(module_count / 2, 1.0) * 0.15
        elif category == "psu":
            efficiency_score = {"80+ Bronze": 0.5, "80+ Silver": 0.6, "80+ Gold": 0.7, "80+ Platinum": 0.9, "80+ Titanium": 1.0}
            performance_bonus = efficiency_score.get(attrs_dict.get("Efficiency Rating", ""), 0)
        elif category == "cpu_cooler":
            performance_bonus = 0.6 if attrs_dict.get("Water Cooled", "").lower() == "yes" else 0.0
            noise = extract_number(attrs_dict.get("Noise Level", ""))
            if noise: performance_bonus += (1 - min(noise / 40, 1)) * 0.4

        performance_score = 1.0 - min(performance_bonus, 1.0)

        # 3. SEARCH RELEVANCE & FINAL SCORE
        relevance_score = min(rank / 40.0, 1.0)
        total_score = (0.45 * price_score) + (0.35 * performance_score) + (0.2 * relevance_score)

        return total_score

    # Trả về pool đã được rank theo score tăng dần (score thấp = tốt hơn)
    ranked_pool = sorted(pool, key=score)
    return [item["doc"] for item in ranked_pool]

 


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
        elif k == "Speed" and category == "ram":
            # RAM dùng "Speed" dạng "DDR5-5600" thay vì "Type"/"Memory Type"
            if "Memory Type" not in compat_info:
                ddr_type = _extract_ddr_type(str(v))
                if ddr_type:
                    compat_info["Memory Type"] = ddr_type
        elif k in ["Motherboard Form Factor", "Form Factor"] and category not in ["ram", "storage"]:
            if "Form Factor" not in compat_info:
                compat_info["Form Factor"] = v
        elif k in ["Length", "Maximum Video Card Length"]:
            if "Length" not in compat_info:
                compat_info["Length"] = v
        elif k == "TDP":
            val = _extract_number(v)
            if val is not None:
                compat_info["Wattage"] = compat_info.get("Wattage", 0.0) + val

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
            print(f"[preferred] Locked {resolved_cat}: {doc_name(chosen)} - {(doc_price(chosen))}")
        else:
            print(f"[preferred] Không tìm thấy '{keyword_clean}' cho category '{resolved_cat}'")

    return locked, compat_info, generic_parts

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
    if category == "psu" and "Wattage" in compat_info:
        required_wattage = (float(compat_info["Wattage"]) + 50.0) / 0.6
        def psu_matches(doc: Any) -> bool:
            attrs_str = getattr(doc, "metadata", {}).get("attrs_json", "{}")
            try:
                attrs = json.loads(attrs_str)
            except Exception:
                return True
            actual_wattage_str = attrs.get("Wattage")
            if not actual_wattage_str:
                return False
            actual_wattage = _extract_number(actual_wattage_str)
            if actual_wattage is None:
                return False
            return actual_wattage >= required_wattage

        filtered = [d for d in docs if psu_matches(d)]
        if not filtered:
            print(f"  [compat filter] Khong co PSU nao vuot qua bo loc Wattage (>={required_wattage}W), dung danh sach goc.")
            return docs
        print(f"  [compat filter] PSU: giu {len(filtered)}/{len(docs)} docs co Wattage >= {required_wattage}W.")
        return filtered

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
        "Memory Type": ["Memory Type", "Type", "Speed"],
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
            matched_alias = None
            for alias in aliases:
                if alias in attrs:
                    actual_val = attrs[alias]
                    matched_alias = alias
                    break
            if actual_val is None:
                return False  # thiếu attr → loại

            exp_str = str(expected_val).strip()
            act_str = str(actual_val).strip()

            # --- Nếu lấy từ "Speed" (RAM) → extract DDR type trước khi so sánh ---
            if matched_alias == "Speed" and compat_key == "Memory Type":
                ddr = _extract_ddr_type(act_str)
                act_str = ddr if ddr else act_str

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

    min_budget = MIN_BUDGETS_FOR_BUILD_PC.get(purpose, 600)
    if budget < min_budget:
        return (f"Budget quá thấp cho {purpose}.")

    allocation_by_purpose = {
        "gaming": {
            "gpu": 0.50,
            "cpu": 0.18,
            "mainboard": 0.08,
            "ram": 0.08,
            "storage": 0.06,
            "cpu_cooler": 0.03,
            "psu": 0.05,
            "case": 0.02,
        },
        "office": {
            "cpu": 0.31,
            "mainboard": 0.15,
            "cpu_cooler": 0.05,
            "gpu": 0.10,
            "ram": 0.15,
            "storage": 0.15,
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
    query_hints_by_purpose = {
        "gaming": {
            "cpu": "latest high performance gaming cpu",
            "mainboard": "gaming mainboard",
            "cpu_cooler": "high performance air cooler liquid cooler",
            "gpu": "lastest gpu, modern gpu for gaming",
            "ram": "high bus gaming ram",
            "storage": "high speed nvme M.2 form factor ssd",
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
            "ram": "large capacity ram",
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

        segment = price_segment(category, target)
  
        prefixes = []

        if category == "cpu":
            if "Socket" in compat_info:
                prefixes.append(f"Socket {compat_info['Socket']}")

        elif category == "mainboard":
            if "Socket" in compat_info:
                prefixes.append(f"Socket/CPU {compat_info['Socket']}")
            if "Memory Type" in compat_info:
                prefixes.append(f"Memory Type {compat_info['Memory Type']}")

        elif category == "cpu_cooler":
            if "Socket" in compat_info:
                prefixes.append(f"CPU Socket {compat_info['Socket']}")

        elif category == "ram":
            if "Memory Type" in compat_info:
                prefixes.append(f"Memory Type {compat_info['Memory Type']}")

        elif category == "case":
            if "Form Factor" in compat_info:
                prefixes.append(f"Form Factor {compat_info['Form Factor']}")
            if "Length" in compat_info:
                prefixes.append(f"VGA Card Length {compat_info['Length']}")

        query = " ".join(prefixes + [query])
        query = f"{segment} segment {query}"
        # elif category == "psu":
        #     if "Wattage" in compat_info:
        #         required_wattage = int((compat_info["Wattage"] + 130) * 1.2)
        #         query += f" Wattage : {required_wattage}W"
        print("Query:", query)
        if category in generic_parts:
            k=40
        else:
            k=100
        docs = ranked_search(query, {"category": category}, k=k)

        # --- Lọc tương thích bằng Python trên attrs_json ---
        selected_categories_so_far = [doc_category(d) for d in selected_parts]
        docs = filter_docs_by_compat(docs, category, compat_info, selected_categories_so_far)
        print(category,"target:",target,"dynamic_cap:",dynamic_cap)
        ranked_docs = choose_doc_by_budget(docs, target_price=target, max_price=dynamic_cap, category=category, is_pc_build=True)
        chosen = ranked_docs[0] if ranked_docs else None
        if chosen:
            selected_parts.append(chosen)
            estimated_spent += doc_price(chosen) or target
            update_compat_info(compat_info, chosen, category)
            actual_price = doc_price(chosen) or target
            delta = target - actual_price

            remaining_cats = [
                c
                for c in categories[idx + 1:]
                if c not in locked
            ]

            if remaining_cats and delta != 0:

                total_ratio = sum(
                    allocation[c]
                    for c in remaining_cats
                )

                if total_ratio > 0:

                    for c in remaining_cats:

                        adjust = int(
                            delta
                            * allocation[c]
                            / total_ratio
                        )

                        category_budget[c] += adjust

    selected_parts = dedupe_docs(selected_parts)
    if not selected_parts:
        return "Không tìm được cấu hình phù hợp với ngân sách hiện tại."

    lines = [f"Đề xuất cấu hình theo ngân sách {(budget)}, Cấu hình dưới đây đã được kiểm tra tính tương thích giữa các linh kiện:"]
    for idx, doc in enumerate(selected_parts, start=1):
        product_id = doc_uid(doc)
        cat = doc_category(doc)
        lines.append(
            (
                f"{idx}. [{doc_name(doc)}] | product_id={product_id} |"
                f"category={cat} | {doc_price(doc)}"
            )
        )

    total_cost = sum(doc_price(doc) or 0 for doc in selected_parts)
    lines.append(f"\nTổng chi phí ước tính: {total_cost}")
    return "\n".join(lines)



def _compare_compat_pair(
    src_vals: Dict[str, str], src_cat: str,
    tgt_attrs: Dict[str, Any], tgt_cat: str,
    constraint_keys: List[str],
) -> tuple[List[str], List[str]]:
    """Kiểm tra ràng buộc 1 chiều (src -> tgt). Trả về (matches, issues)."""
    matches, issues = [], []
    for ck in constraint_keys:
        canon = _COMPAT_KEY_MAP.get(ck)
        if not canon:
            continue
        expected = src_vals.get(canon)
        if not expected:
            continue

        # Tìm giá trị thực tế trong target attrs
        actual, matched_alias = None, None
        for alias in _COMPAT_KEY_ALIASES.get(canon, [canon]):
            if alias in tgt_attrs:
                actual, matched_alias = str(tgt_attrs[alias]), alias
                break
        if actual is None:
            continue

        # RAM Speed -> extract DDR type
        if matched_alias == "Speed" and canon == "Memory Type":
            ddr = _extract_ddr_type(actual)
            actual = ddr if ddr else actual

        exp, act = expected.strip(), actual.strip()

        # Length: so sánh số mm
        if canon == "Length":
            mm_src, mm_tgt = _extract_mm(exp), _extract_mm(act)
            if mm_src is not None and mm_tgt is not None:
                if src_cat == "gpu" and mm_src > mm_tgt:
                    issues.append(f"Chieu dai GPU ({mm_src}mm) vuot qua gioi han Case ({mm_tgt}mm)")
                elif tgt_cat == "gpu" and mm_tgt > mm_src:
                    issues.append(f"Chieu dai GPU ({mm_tgt}mm) vuot qua gioi han Case ({mm_src}mm)")
                else:
                    matches.append(f"Length tuong thich: '{exp}' va '{act}'")
            continue

        # Socket / Memory Type / Form Factor: contains (case-insensitive)
        if exp.lower() in act.lower() or act.lower() in exp.lower():
            matches.append(f"{canon} tuong thich: '{exp}' va '{act}'")
        else:
            issues.append(f"{canon} khong tuong thich: '{exp}' vs '{act}'")

    return matches, issues


def _check_all_compatibility(docs: List[Any], not_found: List[str]) -> str:
    """Kiểm tra tương thích pairwise giữa danh sách docs. Trả về report dạng text."""
    lines: List[str] = ["San pham duoc kiem tra:"]
    for idx, doc in enumerate(docs, start=1):
        lines.append(f"  {idx}. {doc_name(doc)} (category: {doc_category(doc)}, product_id: {doc_uid(doc)})")
    if not_found:
        lines.append(f"\nKhong tim thay: {', '.join(not_found)}")
    lines.append("")

    has_any, all_ok = False, True

    for i in range(len(docs)):
        for j in range(i + 1, len(docs)):
            doc_a, doc_b = docs[i], docs[j]
            cat_a, cat_b = doc_category(doc_a), doc_category(doc_b)

            keys_ab = COMPATIBILITY_ATTRS.get((cat_a, cat_b), [])
            keys_ba = COMPATIBILITY_ATTRS.get((cat_b, cat_a), [])
            if not keys_ab and not keys_ba:
                continue

            attrs_a = json.loads(getattr(doc_a, "metadata", {}).get("attrs_json", "{}"))
            attrs_b = json.loads(getattr(doc_b, "metadata", {}).get("attrs_json", "{}"))
            vals_a = _extract_compat_values(attrs_a, cat_a)
            vals_b = _extract_compat_values(attrs_b, cat_b)

            matches, issues = [], []
            if keys_ab:
                m, iss = _compare_compat_pair(vals_a, cat_a, attrs_b, cat_b, keys_ab)
                matches += m; issues += iss
            if keys_ba:
                m, iss = _compare_compat_pair(vals_b, cat_b, attrs_a, cat_a, keys_ba)
                matches += m; issues += iss

            # Dedup
            matches = list(dict.fromkeys(matches))
            issues = list(dict.fromkeys(issues))
            if not matches and not issues:
                continue

            has_any = True
            ok = len(issues) == 0
            if not ok:
                all_ok = False

            lines.append(f"--- {doc_name(doc_a)} <-> {doc_name(doc_b)} ---")
            lines.append(f"Ket qua: {'Tuong thich' if ok else 'Khong tuong thich'}")
            for m in matches:
                lines.append(f"  [OK] {m}")
            for iss in issues:
                lines.append(f"  [FAIL] {iss}")
            lines.append("")

    if not has_any:
        lines.append("Khong co rang buoc tuong thich giua cac linh kien duoc cung cap.")
    else:
        lines.append(f"Tong ket: {'Tat ca linh kien deu tuong thich.' if all_ok else 'Co mot so van de tuong thich can luu y.'}")

    return "\n".join(lines)

# =====================================================
# TOOLS
# =====================================================

@tool
def search_products(keyword: str = "", category: str = "", limit: int = 15, purpose: str = "") -> str:
    """Tìm sản phẩm theo từ khóa(keyword: bằng tiếng Anh) và loại linh kiện(category), các giá trị category có thể điền: cpu, gpu, mainboard, cpu_cooler, ram, storage, psu, case. Tham số purpose (tùy chọn) tính chất, mục đích sử dụng ngắn gọn bằng tiếng Anh(ví dụ: gaming, office, ...)."""
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
def search_products_by_budget(target_price: int, keyword: str = "", product_type: str = "",limit: int = 5, purpose: str = "") -> str:
    """
    Tìm sản phẩm gần với ngân sách mục tiêu của người dùng (target_price), bắt buộc có loại sản phẩm (product_type). Từ khóa (keyword). Tham số purpose (tùy chọn) tính chất, mục đích sử dụng ngắn gọn(ví dụ: gaming, office, ...).
    """
    purpose = (purpose or "").strip()
    if purpose:
        print(f"[Tool: search_products_by_budget] User purpose: {purpose}")

    if target_price <= 0:
        return "Ngân sách phải lớn hơn 0."

    min_price = int(target_price * 0.8)
    max_price = int(target_price * 1.2)

    query = f"{keyword}"
    if purpose:
        query = f"{query} {purpose}".strip()

    category_norm = (product_type or "").strip().lower()
    segment = price_segment(category_norm, target_price)
    query = f"{query} {segment} segment".strip()

    docs = ranked_search(query, {"category": product_type}, k=100)


    if not docs:
        return "Không tìm thấy sản phẩm."
    docs = choose_doc_by_budget(docs, target_price=target_price, max_price=max_price, category=product_type, is_pc_build=False)

    docs = docs[: max(1, min(limit, 50))]

    if not docs:
        return "Không tìm thấy sản phẩm phù hợp với ngân sách."

    return build_context_block(docs)
@tool
def recommend_pc_build(budget: int, purpose: str = "gaming", preferred_parts: Optional[Dict[str, str]] = None) -> str:
    """
    Gợi ý cấu hình PC theo ngân sách và mục đích.
    Có 4 mục đích tượng trưng, tùy vào mục đích người dùng mà để điền vào purpose: gaming, office, workstation, creator.
    Quy tắc trích xuất preferred_parts:
    - Nếu người dùng chỉ định linh kiện hoặc THƯƠNG HIỆU (Intel, AMD, Nvidia, RTX...), phải đưa vào dict.
    - Key: cpu, gpu, ram, mainboard, cpu_cooler, storage, psu, case.
    - Value: Tên model hoặc tên thương hiệu.

    Ví dụ:
    - "PC gaming Intel 1000 Đô" -> budget=1000, preferred_parts={"cpu": "Intel"}
    - "Build máy dùng card RTX" -> preferred_parts={"gpu": "RTX"}
    """
    if budget <= 0:
        return "Ngân sách phải lớn hơn 0."

    return build_pc_recommendation(budget=budget, purpose=purpose, preferred_parts=preferred_parts)


def find_best_component_by_score(
    category: str,
    min_score: float,
    brand: Optional[str] = None,
) -> Optional[Any]:
    """Vector search CPU/GPU rồi lọc theo benchmark score >= min_score, chọn sản phẩm có score gần nhất."""
    if category == "cpu":
        query = "high performance gaming cpu"
        score_key = "cpu_single_thread"
    elif category == "gpu":
        query = "modern gaming gpu"
        score_key = "gpu_g3d"
    else:
        return None

    if brand:
        query = f"{brand} {query}"

    docs = ranked_search(query, {"category": category}, k=150)
    if not docs:
        return None

    # Filter by brand name if specified
    if brand:
        brand_lower = brand.strip().lower()
        brand_filtered = []
        for d in docs:
            if brand_lower in doc_name(d).lower():
                brand_filtered.append(d)
                continue
                
            attrs_str = getattr(d, "metadata", {}).get("attrs_json", "{}")
            try:
                attrs = json.loads(attrs_str)
                if any(brand_lower in str(v).lower() for v in attrs.values()):
                    brand_filtered.append(d)
            except Exception:
                pass
                
        if brand_filtered:
            docs = brand_filtered

    # Filter docs that meet min_score, then sort by score ascending (closest to min)
    candidates = []
    for doc in docs:
        score_val = float(doc.metadata.get(score_key, 0) or 0)
        if score_val >= min_score:
            candidates.append((doc, score_val))

    if candidates:
        # Sort by score ascending → pick the one closest to min_score (best value)
        candidates.sort(key=lambda x: (x[1], doc_price(x[0])))
        chosen = candidates[0][0]
        print(f"[find_best] {category}: {doc_name(chosen)} (score={candidates[0][1]}, min={min_score})")
        return chosen

    # Fallback: no doc meets min_score → pick the one with highest score
    fallback = []
    for doc in docs:
        score_val = float(doc.metadata.get(score_key, 0) or 0)
        if score_val > 0:
            fallback.append((doc, score_val))

    if fallback:
        fallback.sort(key=lambda x: (x[1] - min_score, doc_price(x[0])))
        chosen = fallback[0][0]
        print(f"[find_best] {category} FALLBACK: {doc_name(chosen)} (score={fallback[0][1]}, min={min_score})")
        return chosen

    return None


@tool
def build_pc_for_game(
    game_name: str,
    resolution: str = "1080p",
    target_setting: str = "Ultra",
    target_fps: int = 60,
    budget: Optional[int] = None,
    cpu_brand: Optional[str] = None,
    gpu_brand: Optional[str] = None,
) -> str:
    """
    Build cấu hình PC tối ưu để chơi một game cụ thể.
    Tham số:
    - game_name (bắt buộc): Tên game đầy đủ, chính thức, ví dụ: "Cyberpunk 2077", "League of Legends", "Counter-Strike 2 (CS2)". Nếu người dùng nhập tên viết tắt (như lol, cs2, gta5), hãy chuẩn hóa thành tên đầy đủ trước khi gọi tool. Nếu người dùng yêu cầu nhiều game thì đưa vào game nặng nhất.
    - resolution: độ phân giải mục tiêu ("1080p", "1440p", "4K"). Mặc định "1080p".
    - target_setting: mức cài đặt đồ họa ("Low", "Medium", "High", "Ultra"). Mặc định "Ultra".
    - target_fps: FPS mong muốn (60, 120, 144...). Mặc định 60.
    - budget: ngân sách (USD, tùy chọn). Nếu không cung cấp, sẽ tự ước tính.
    - cpu_brand: thương hiệu CPU ưa thích ("Intel", "AMD", tùy chọn), nếu người dùng không đề cập thì để trống.
    - gpu_brand: thương hiệu GPU ưa thích ("Nvidia", "AMD", tùy chọn), nếu người dùng không đề cập thì để trống.
    """
    # Step 1: Fuzzy search game profile
    game_result, game_status = dal_fuzzy_search_game_profile(game_name)
    if game_status != 200:
        return f"Không tìm thấy game '{game_name}' trong cơ sở dữ liệu. Vui lòng kiểm tra lại tên game."

    matched_game = game_result["game_name"]
    tier = game_result["tier"]
    ram_gb = game_result["ram_gb"]
    storage_gb = game_result["storage_gb"]
    print(f"[build_pc_for_game] Game: {matched_game}, Tier: {tier}, RAM: {ram_gb}GB, Storage: {storage_gb}GB")

    # Step 2: Get tier requirements
    tier_result, tier_status = dal_get_game_tier_requirements(tier, resolution, target_setting, target_fps)
    if tier_status != 200:
        return (f"Không tìm thấy yêu cầu phần cứng cho game '{matched_game}' "
                f"ở {resolution}/{target_setting}/{target_fps}fps. Vui lòng thử mức cài đặt khác.")

    min_cpu_score = float(tier_result["min_cpu_score"])
    min_gpu_score = float(tier_result["min_gpu_score"])
    print(f"[build_pc_for_game] Min CPU score: {min_cpu_score}, Min GPU score: {min_gpu_score}")

    # Step 3: Find best CPU & GPU by benchmark score
    cpu_doc = find_best_component_by_score("cpu", min_cpu_score, cpu_brand)
    gpu_doc = find_best_component_by_score("gpu", min_gpu_score, gpu_brand)

    if not cpu_doc and not gpu_doc:
        return "Không tìm được CPU/GPU phù hợp với yêu cầu của game."

    preferred_parts: Dict[str, str] = {}
    if cpu_doc:
        preferred_parts["cpu"] = doc_name(cpu_doc)
    if gpu_doc:
        preferred_parts["gpu"] = doc_name(gpu_doc)

    # Step 4: Estimate budget if not provided
    if not budget or budget <= 0:
        # Estimate from CPU + GPU prices (they're ~65-70% of total)
        estimated_component_cost = 0
        if cpu_doc:
            estimated_component_cost += doc_price(cpu_doc) or 0
        if gpu_doc:
            estimated_component_cost += doc_price(gpu_doc) or 0

        if estimated_component_cost > 0:
            budget = int(estimated_component_cost * 1.5)
        else:
            budget = 1000  # Fallback default
        print(f"[build_pc_for_game] Auto-estimated budget: ${budget}")

    # Step 5: Build full PC
    result = build_pc_recommendation(budget=budget, purpose="gaming", preferred_parts=preferred_parts)

    header = (
        f"Cấu hình PC cho game **{matched_game}** "
        f"({resolution} / {target_setting} / {target_fps}fps):\n"
        f"Yêu cầu: RAM >= {ram_gb}GB, Storage >= {storage_gb}GB\n\n"
    )
    return header + result


@tool
def build_pc_for_software(
    software_name: str,
    workload_scale: str = "Intermediate",
    budget: Optional[int] = None,
    cpu_brand: Optional[str] = None,
    gpu_brand: Optional[str] = None,
) -> str:
    """
    Build cấu hình PC tối ưu để sử dụng một phần mềm làm việc/đồ họa cụ thể.
    Tham số:
    - software_name (bắt buộc): Tên phần mềm đầy đủ, ví dụ: "Adobe Premiere Pro", "AutoCAD", "Blender".
    - workload_scale: Mức độ sử dụng ("Basic", "Intermediate", "Professional"). Mặc định "Intermediate".
    - budget: ngân sách (USD, tùy chọn). Nếu không cung cấp, sẽ tự ước tính.
    - cpu_brand: thương hiệu CPU ưa thích ("Intel", "AMD", tùy chọn).
    - gpu_brand: thương hiệu GPU ưa thích ("Nvidia", "AMD", tùy chọn).
    """
    # Step 1: Fuzzy search software profile
    software_result, software_status = dal_fuzzy_search_software_profile(software_name)
    if software_status != 200:
        return f"Không tìm thấy phần mềm '{software_name}' trong cơ sở dữ liệu. Vui lòng kiểm tra lại tên phần mềm."

    matched_software = software_result["software_name"]
    tier = software_result["tier"]
    ram_gb = software_result["ram_gb"]
    storage_gb = software_result["storage_gb"]
    print(f"[build_pc_for_software] Software: {matched_software}, Tier: {tier}, RAM: {ram_gb}GB, Storage: {storage_gb}GB")

    # Step 2: Get tier requirements
    tier_result, tier_status = dal_get_software_tier_requirements(tier, workload_scale)
    if tier_status != 200:
        return (f"Không tìm thấy yêu cầu phần cứng cho phần mềm '{matched_software}' "
                f"ở mức độ {workload_scale}. Vui lòng thử mức độ khác.")

    min_cpu_score = float(tier_result["min_cpu"])
    min_gpu_score = float(tier_result["min_gpu"])
    print(f"[build_pc_for_software] Min CPU score: {min_cpu_score}, Min GPU score: {min_gpu_score}")

    # Step 3: Find best CPU & GPU by benchmark score
    cpu_doc = find_best_component_by_score("cpu", min_cpu_score, cpu_brand)
    gpu_doc = find_best_component_by_score("gpu", min_gpu_score, gpu_brand)

    if not cpu_doc and not gpu_doc:
        return "Không tìm được CPU/GPU phù hợp với yêu cầu của phần mềm."

    preferred_parts: Dict[str, str] = {}
    if cpu_doc:
        preferred_parts["cpu"] = doc_name(cpu_doc)
    if gpu_doc:
        preferred_parts["gpu"] = doc_name(gpu_doc)

    # Step 4: Estimate budget if not provided
    if not budget or budget <= 0:
        estimated_component_cost = 0
        if cpu_doc:
            estimated_component_cost += doc_price(cpu_doc) or 0
        if gpu_doc:
            estimated_component_cost += doc_price(gpu_doc) or 0

        if estimated_component_cost > 0:
            budget = int(estimated_component_cost * 1.6)
        else:
            budget = 1000  # Fallback default
        print(f"[build_pc_for_software] Auto-estimated budget: ${budget}")

    # Step 5: Build full PC
    result = build_pc_recommendation(budget=budget, purpose="creator", preferred_parts=preferred_parts)

    header = (
        f"Cấu hình PC cho phần mềm **{matched_software}** "
        f"(Mức độ: {workload_scale}):\n"
        f"Yêu cầu: RAM >= {ram_gb}GB, Storage >= {storage_gb}GB\n\n"
    )
    return header + result


@tool
def get_available_types() -> str:
    """Trả về các loại linh kiện."""
    types = sorted(CATEGORY_KEYWORDS.keys())
    return "Các loại sản phẩm hiện có: " + ", ".join(types)

@tool
def compare_products(product_names: List[str]) -> str:
    """So sánh các sản phẩm dựa vào giá và các thông số quan trọng của chúng. Dựa theo giá, thông tin chi tiết và thông số kỹ thuật của các sản phẩm để so sánh và kết luận. Cung cấp danh sách tên sản phẩm hoặc từ khóa (tối đa 5 sản phẩm)."""
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
        
    category = next(iter(categories))
    lines = []
    for idx, doc in enumerate(docs, start=1):
        product_id = doc_uid(doc)
        attrs = doc_filtered_attrs(doc)
        line = (
            f"Sản phẩm {idx}: {doc_name(doc)} | "
            f"category={doc_category(doc)} | price={doc_price(doc)} | product_id={product_id} | "
            f"Thông số: {attrs}"
        )
        lines.append(line)

    # --- Benchmark so sánh cho CPU ---
    if category == "cpu" and len(docs) >= 2:
        benchmarks = []
        for doc in docs:
            multi = float(doc.metadata.get('cpu_multi_thread', 0) or 0)
            single = float(doc.metadata.get('cpu_single_thread', 0) or 0)
            benchmarks.append({"name": doc_name(doc), "multi": multi, "single": single})

        lines.append("\n--- Benchmark CPU ---")
        if len(benchmarks) == 2:
            a, b_ = benchmarks[0], benchmarks[1]
            if a["multi"] > 0 and b_["multi"] > 0:
                diff_pct = abs(a["multi"] - b_["multi"]) / min(a["multi"], b_["multi"]) * 100
                better = a["name"] if a["multi"] > b_["multi"] else b_["name"]
                lines.append(f"  Multi-thread: {better} cao hơn {diff_pct:.1f}%")
            if a["single"] > 0 and b_["single"] > 0:
                diff_pct = abs(a["single"] - b_["single"]) / min(a["single"], b_["single"]) * 100
                better = a["name"] if a["single"] > b_["single"] else b_["name"]
                lines.append(f"  Single-thread: {better} cao hơn {diff_pct:.1f}%")
        elif len(benchmarks) > 2:
            best_multi = max(benchmarks, key=lambda x: x["multi"])
            best_single = max(benchmarks, key=lambda x: x["single"])
            for b in benchmarks:
                if b["name"] != best_multi["name"] and best_multi["multi"] > 0 and b["multi"] > 0:
                    diff_pct = (best_multi["multi"] - b["multi"]) / b["multi"] * 100
                    lines.append(f"  Multi-thread: {best_multi['name']} cao hơn {b['name']} {diff_pct:.1f}%")
            for b in benchmarks:
                if b["name"] != best_single["name"] and best_single["single"] > 0 and b["single"] > 0:
                    diff_pct = (best_single["single"] - b["single"]) / b["single"] * 100
                    lines.append(f"  Single-thread: {best_single['name']} cao hơn {b['name']} {diff_pct:.1f}%")

    # --- Benchmark so sánh cho GPU ---
    elif category == "gpu" and len(docs) >= 2:
        benchmarks = []
        for doc in docs:
            g3d = float(doc.metadata.get('gpu_g3d', 0) or 0)
            benchmarks.append({"name": doc_name(doc), "g3d": g3d})

        lines.append("\n--- Benchmark GPU ---")
        if len(benchmarks) == 2:
            a, b_ = benchmarks[0], benchmarks[1]
            if a["g3d"] > 0 and b_["g3d"] > 0:
                diff_pct = abs(a["g3d"] - b_["g3d"]) / min(a["g3d"], b_["g3d"]) * 100
                better = a["name"] if a["g3d"] > b_["g3d"] else b_["name"]
                lines.append(f"  G3D Mark: {better} cao hơn {diff_pct:.1f}%")
        elif len(benchmarks) > 2:
            best = max(benchmarks, key=lambda x: x["g3d"])
            for b in benchmarks:
                if b["name"] != best["name"] and best["g3d"] > 0 and b["g3d"] > 0:
                    diff_pct = (best["g3d"] - b["g3d"]) / b["g3d"] * 100
                    lines.append(f"  G3D Mark: {best['name']} cao hơn {b['name']} {diff_pct:.1f}%")

    print(lines)
    return "\n".join(lines)


@tool
def find_compatible_products(provided_products: List[str], target_categories: List[str], target_keywords: List[str] = None) -> str:
    """
    Tìm kiếm các sản phẩm tương thích với sản phẩm được người dùng đưa ra (provided_products).
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
        
        docs = ranked_search(query, filters={"category": filter_cat} if filter_cat in CATEGORY_KEYWORDS else None, k=50)
        
        # Lọc tương thích dựa trên cấu hình gốc
        selected_categories_so_far = [doc_category(d) for d in base_docs]
        docs = filter_docs_by_compat(docs, filter_cat, compat_info, selected_categories_so_far)
        docs = docs[:5]
        
        if docs:
            display_name = target_kw_norm if target_kw_norm else target_cat_norm
            results.append(f"\n--- Đề xuất cho {display_name} (Query: '{query}') ---")
            for idx, doc in enumerate(docs, start=1):
                results.append(
                    f"[{idx}] {doc_name(doc)} | price={doc_price(doc)} | product_id={doc_uid(doc)}\n"
                    # f"Thông số: {doc_filtered_attrs(doc)}"
                )
        else:
            display_name = target_kw_norm if target_kw_norm else target_cat_norm
            results.append(f"\n--- Không tìm thấy {display_name} phù hợp với yêu cầu (Query: '{query}') ---")
            
    return "\n".join(results)

@tool
def check_compatibility(product_names: List[str]) -> str:
    """
    Kiểm tra tương thích giữa các linh kiện PC.
    Cung cấp danh sách tên sản phẩm (tối đa 8) để kiểm tra xem chúng có tương thích với nhau không.
    """
    if not product_names or len(product_names) < 2:
        return "Vui long cung cap it nhat 2 san pham de kiem tra tuong thich."
    if len(product_names) > 8:
        return "Chi ho tro kiem tra toi da 8 san pham cung luc."

    docs, not_found = [], []
    for q in product_names:
        found = ranked_search(q, filters=None, k=1)
        if found:
            docs.append(found[0])
        else:
            not_found.append(q)

    if len(docs) < 2:
        return "Khong tim du san pham de kiem tra tuong thich."

    return _check_all_compatibility(docs, not_found)


@tool
def query_shop_faq(question: str) -> str:
    """Trả lời các câu hỏi liên quan đến cửa hàng (shop FAQ), thông tin liên hệ, địa chỉ, giờ mở cửa, cách thức mua hàng, phương thức thanh toán, chính sách bảo hành, đổi trả... (không liên quan đến tìm sản phẩm linh kiện). Hoặc các câu hỏi kiến thức về linh kiện PC."""
    try:
        results = faq_db.similarity_search_with_score(question, k=1)
        if not results:
            return "Không tìm thấy thông tin phù hợp với câu hỏi của bạn về cửa hàng."
        
        doc, score = results[0]
        # Cosine similarity: similarity = 1.0 - (score / 2.0)
        similarity = 1.0 - (score / 2.0)
        print(f"[Tool: query_shop_faq] similarity: {similarity:.4f}, score (distance): {score:.4f}")
        
        if similarity > 0.2:
            faq_id = doc.metadata.get("faq_id")
            if faq_id is not None:
                faq_result, status = dal_get_faq_by_id(faq_id)
                if status == 200 and faq_result and "answer" in faq_result:
                    return faq_result["answer"]
                
        return "Không tìm thấy thông tin phù hợp với câu hỏi của bạn về cửa hàng."
    except Exception as e:
        print(f"Error in query_shop_faq tool: {e}")
        return "Đã xảy ra lỗi khi truy vấn thông tin cửa hàng."


def format_node(state: AgentState):
    messages = state.get("messages", [])
    if not messages: return {"messages": []}

    last_message = messages[-1]
    content = getattr(last_message, "content", "")
    if not content: return {"messages": []}

    # =====================================================
    # Lấy text từ Gemini hoặc các model khác & xử lý markdown
    # =====================================================
    if isinstance(content, list):
        parts = [item.get("text", "") for item in content if isinstance(item, dict) and item.get("type") == "text"]
        content_str = "\n".join(parts).strip()
    else:
        content_str = str(content).strip()

    if not content_str: return {"messages": []}

    if code_match := re.search(r"```(?:json)?\s*(.*?)```", content_str, re.S | re.I):
        content_str = code_match.group(1).strip()

    # =====================================================
    # Helpers
    # =====================================================
    def normalize(parsed: dict):
        # migrate schema cũ
        if "product_groups" not in parsed:
            pids = parsed.pop("product_ids", [])
            parsed["product_groups"] = []
            if pids: parsed["product_groups"].append({"label": "", "order": 1, "product_ids": [str(x) for x in pids]})

        groups = []
        for g in parsed.get("product_groups", []):
            if not isinstance(g, dict): continue
            ids = g.get("product_ids", [])
            if not isinstance(ids, list): ids = []
            groups.append({"label": str(g.get("label", "")), "order": int(g.get("order", 1)), "product_ids": [str(x) for x in ids]})

        return {
            "message": str(parsed.get("message") or ""),
            "intent": str(parsed.get("intent") or ""),
            "suggested_prompts": parsed.get("suggested_prompts") if isinstance(parsed.get("suggested_prompts"), list) else [],
            "product_groups": groups,
        }

    def extract_json_with_message(text: str):
        decoder = json.JSONDecoder()
        for i, ch in enumerate(text):
            if ch != "{": continue
            try:
                obj, end = decoder.raw_decode(text[i:])
                return text[:i].strip(), obj
            except json.JSONDecodeError: continue
        return None, None

    # =====================================================
    # 1. Thử parse toàn bộ & 2. Thử tìm JSON nằm cuối
    # =====================================================
    try:
        parsed = json.loads(content_str)
        if isinstance(parsed, dict):
            return {"messages": [AIMessage(content=json.dumps(normalize(parsed), ensure_ascii=False))]}
    except Exception: pass

    message_before_json, parsed = extract_json_with_message(content_str)
    if isinstance(parsed, dict):
        parsed = normalize(parsed)
        if message_before_json: parsed["message"] = message_before_json
        return {"messages": [AIMessage(content=json.dumps(parsed, ensure_ascii=False))]}

    # =====================================================
    # 3. Fallback regex product ids
    # =====================================================
    product_ids = extract_product_ids_from_text(content_str)
    for match in re.findall(r"\[[\d\s,]+\]", content_str):
        product_ids.extend(re.findall(r"\d+", match))
    product_ids = list(dict.fromkeys(product_ids))

    message = re.sub(r"\[[\d\s,]+\]", "", content_str)
    message = re.sub(r"product_id\s*:\s*\[[\d\s,]+\]", "", message).strip()

    product_groups = [{"label": "", "order": 1, "product_ids": product_ids}] if product_ids else []
    result = {"message": message, "intent": "", "suggested_prompts": [], "product_groups": product_groups}

    return {"messages": [AIMessage(content=json.dumps(result, ensure_ascii=False))]}

tools = [
    search_products,
    search_products_by_budget,
    recommend_pc_build,
    build_pc_for_game,
    build_pc_for_software,
    get_available_types,
    compare_products,
    find_compatible_products,
    check_compatibility,
    query_shop_faq,
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
- Chỉ trả lời dựa trên dữ liệu từ tools. Nếu ngoài dữ liệu, trả lời không biết. Và shop chỉ có sản phẩm mới, không có linh kiện đã qua sử dụng.
- Khi điền tham số keyword cho các tools, hãy điền bằng tiếng Anh (Ví dụ: cpu intel mới nhất → Keyword: Latest Intel)
- Khi điền tham số product_type cho các tools, hãy điền theo các giá trị sau: cpu, gpu, mainboard, cpu_cooler, ram, storage, psu, case.
- Giá truyền vào tool phải ở dạng USD; nếu user nhập tiền Việt như “triệu”, “tr”, “k”, “VNĐ”, “đ” thì hãy tự hiểu và quy đổi sang USD trước khi truyền.

Tool Guidance:
- Trả lời các câu hỏi về cửa hàng, chính sách, thông tin liên hệ, vận chuyển, bảo hành, giờ làm việc... hoặc kiến thức về linh kiện PC (Ví dụ: Intel Core i5 là gì?, Khác biệt giữa Intel Core i5 và Intel Core i7 là gì?, DDR4 và DDR5 khác nhau thế nào?, ...) → query_shop_faq
- Tìm danh mục sản phẩm → get_available_types
- Tìm/duyệt sản phẩm → search_products (trả về người dùng tối đa 5 sản phẩm chuẩn nhất với yêu cầu người dùng)
- Tìm/duyệt sản phẩm theo ngân sách → search_products_by_budget
- So sánh các sản phẩm cụ thể (nhận xét từng thông số + kết luận ngắn) → compare_products
- Kiểm tra tương thích giữa các linh kiện có sẵn → check_compatibility
- Tìm linh kiện tương thích với sản phẩm người dùng đưa ra → find_compatible_products
- Build PC hoặc thay đổi, nâng cấp linh kiện trong cấu hình trước đó → recommend_pc_build; hỏi thêm nếu thiếu ngân sách/nhu cầu (gaming, office, workstation, creator); dùng preferred_parts nếu người dùng chỉ định hoặc muốn chỉnh sửa cấu hình trước đó.
- Build PC để chơi game cụ thể (ví dụ: "build PC chơi Cyberpunk 2077", "cấu hình chơi game triple A ổn định", "cấu hình chơi Valorant 1440p 144fps") → build_pc_for_game; chỉ cần tên game là đủ, các tham số khác tùy chọn. Nếu user chỉ định budget thì truyền vào, nếu không thì để tool tự ước tính.
- Build PC để dùng phần mềm cụ thể (ví dụ: "build PC chạy Premiere Pro chuyên nghiệp", "cấu hình AutoCAD cơ bản") → build_pc_for_software; chỉ cần tên phần mềm là đủ, có thể thêm workload_scale (Basic/Intermediate/Professional).
- Khi sử dụng các tool mà có đầu vào là các sản phẩm có tên cụ thể thì cần dùng tool search_products để lấy list sản phẩm được trả về để xác nhận sản phẩm có đúng không rồi mới dùng các tool kia. (ví dụ cần dùng tool find_compatible_products để tìm mainboard nào phù hợp với cpu Intel Celeron E3400 thì dùng search_products để xác nhận cpu Intel Celeron E3400 có tồn tại không)

Output: Trả về JSON hợp lệ với 3 khóa:
- "intent": ý định ngắn gọn bằng tiếng Anh (ví dụ: "build pc", "search", "compare", ...).
- "message": markdown, hiển thị thêm bảng nếu cần, in đậm những từ cần thiết, không dùng icon, in ra danh sách sản phẩm nếu có (không kèm product_id).
- "product_groups": mảng nhóm sản phẩm, mỗi nhóm gồm "label", "order", "product_ids".
  Chỉ chia nhiều nhóm khi kết quả thuộc các category rõ ràng khác nhau; còn lại dùng 1 nhóm, label = "".
  Nếu không có sản phẩm: [].
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
        

workflow = StateGraph(AgentState)
workflow.add_node("agent", agent_node)
workflow.add_node("tools", ToolNode(tools))
workflow.add_node("format_node", format_node)

workflow.add_edge(START, "agent")
workflow.add_conditional_edges(
    "agent",
    tools_condition,
    {"tools": "tools", END: "format_node"},
)
workflow.add_edge("tools", "agent")
workflow.add_edge("format_node", END)

app = workflow.compile()


def create_pc_product_agent():
    return app
