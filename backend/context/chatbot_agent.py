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
    "cpu_cooler": ["cooler", "tan", "tản"],
    "case": ["case", "vo may", "vỏ máy"],
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
            "price": {"$gte": min_price}
        })

    # price <=
    if max_price is not None:
        conditions.append({
            "price": {"$lte": max_price}
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
        f"sản phẩm phù hợp cho nhu cầu {query}",
        f"linh kiện pc {query}",
    ]

    for q in queries:
        try:
            docs = db.similarity_search(q, k=k, filter=filters if filters else None)
            results.extend(docs)
        except Exception:
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


def build_pc_recommendation(budget: int, priority: str = "balance") -> str:
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
        "cpu": "cpu hiệu năng tốt, ổn định nhiệt, giá hợp lý",
        "mainboard": "mainboard tương thích cpu, độ bền tốt",
        "gpu": "gpu mạnh cho gaming 1080p/2k",
        "ram": "ram 16gb hoặc 32gb độ trễ tốt",
        "storage": "ssd nvme tốc độ cao",
        "psu": "psu chất lượng 80 plus, công suất đủ",
        "case": "case airflow tốt, dễ lắp ráp",
    }

    categories = ["cpu", "mainboard", "gpu", "ram", "storage", "psu", "case"]
    selected_parts: List[Any] = []
    estimated_spent = 0

    for idx, category in enumerate(categories):
        target = category_budget[category]
        remaining_cats = categories[idx + 1 :]
        reserve_for_remaining = sum(int(category_budget[c] * 0.70) for c in remaining_cats)
        remaining_budget_now = max(budget - estimated_spent, 0)

        dynamic_cap = min(
            int(target * 1.25),
            max(remaining_budget_now - reserve_for_remaining, int(target * 0.80)),
        )
        dynamic_cap = max(dynamic_cap, int(target * 0.80))

        docs = ranked_search(query_hint[category], {"category": category}, k=20)
        chosen = choose_doc_by_budget(docs, target_price=target, max_price=dynamic_cap)
        if chosen:
            selected_parts.append(chosen)
            estimated_spent += doc_price(chosen) or target

    selected_parts = dedupe_docs(selected_parts)
    if not selected_parts:
        return "Không tìm được cấu hình phù hợp với ngân sách hiện tại."

    lines = [f"Đề xuất cấu hình theo ngân sách {vnd(budget)}:"]
    for idx, doc in enumerate(selected_parts, start=1):
        product_id = doc_uid(doc)
        product_link = f"/product-info/{product_id}"
        image_url = doc_image(doc)
        lines.append(
            (
                f"{idx}. [{doc_name(doc)}]({product_link}) | "
                f"{doc_category(doc)} | {vnd(doc_price(doc))}"
            )
        )
        if image_url:
            lines.append(f"   [![{doc_name(doc)}]({image_url})]({product_link})")

    total_cost = sum(doc_price(doc) or 0 for doc in selected_parts)
    lines.append(f"Tong chi phi uoc tinh: {vnd(total_cost)}")
    return "\n".join(lines)


# =====================================================
# TOOLS
# =====================================================

@tool
def search_products_by_keyword(keyword: str, limit: int = 10) -> str:
    """Tim san pham theo tu khoa trong mo ta/ten san pham."""
    keyword = (keyword or "").strip()
    if not keyword:
        return "Vui lòng cung cấp từ khóa để tìm sản phẩm."

    docs = ranked_search(keyword, None, k=max(1, min(limit, 10)))
    docs = docs[: max(1, min(limit, 10))]
    if not docs:
        return f"Không tìm thấy sản phẩm nào với từ khóa '{keyword}'."

    return build_context_block(docs)


@tool
def search_products_by_type(product_type: str, limit: int = 10) -> str:
    """Tim san pham theo loai linh kien."""
    product_type = (product_type or "").strip().lower()
    if not product_type:
        return "Vui lòng cung cấp loại sản phẩm."

    docs = ranked_search(product_type, {"category": product_type}, k=max(1, min(limit, 10)))
    docs = docs[: max(1, min(limit, 10))]
    if not docs:
        return f"Không tìm thấy sản phẩm loại '{product_type}'."

    return build_context_block(docs)


@tool
def search_products_by_budget(target_price: int, keyword: str = "", product_type: str = "", limit: int = 5) -> str:
    """
    Tìm sản phẩm gần với ngân sách mục tiêu của người dùng (target_price) và keyword.
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

    # filtered_docs = [
    #     doc for doc in docs
    #     if min_price <= (doc_price(doc) or 0) <= max_price
    # ]

    # if not filtered_docs:
    #     docs = sorted(
    #         docs,
    #         key=lambda d: abs((doc_price(d) or 0) - target_price)
    #     )
    # else:
    #     docs = sorted(
    #         filtered_docs,
    #         key=lambda d: abs((doc_price(d) or 0) - target_price)
    #     )

    docs = docs[: max(1, min(limit, 20))]

    if not docs:
        return "Không tìm thấy sản phẩm phù hợp với ngân sách."

    return build_context_block(docs)

@tool
def recommend_pc_build(budget: int, priority: str = "balance") -> str:
    """Goi y cau hinh PC can doi theo ngan sach va muc tieu su dung."""
    if budget <= 0:
        return "Ngân sách phải lớn hơn 0."

    return build_pc_recommendation(budget=budget, priority=priority)


@tool
def get_available_types() -> str:
    """Tra ve cac loai linh kien co the tim."""
    types = sorted(CATEGORY_KEYWORDS.keys())
    return "Các loại sản phẩm hiện có: " + ", ".join(types)


tools = [
    search_products_by_keyword,
    search_products_by_type,
    search_products_by_budget,
    recommend_pc_build,
    get_available_types,
]


# =====================================================
# AGENT GRAPH
# =====================================================

llm = get_llm()
llm_with_tools = llm.bind_tools(tools, tool_choice="auto")

system_prompt = SystemMessage(
    content="""
Bạn là trợ lý tư vấn cho shop linh kiện PC và laptop.

Quy tắc:
- Chỉ trả lời dựa trên dữ liệu từ tools.
- Trả lời bằng JSON hợp lệ với 2 khóa bắt buộc: "message" và "product_ids".
- "message" phải là nội dung markdown ngắn gọn, rõ ràng, không sử dụng icon.
- "product_ids" là danh sách product_id lấy từ các sản phẩm phù hợp; nếu không có sản phẩm thì trả về [].
- Nếu người dùng hỏi chung về loại sản phẩm, dùng get_available_types hoặc search_products_by_type.
- Nếu có ngân sách, dùng search_products_by_budget hoặc recommend_pc_build.
- Nếu người dùng muốn build PC, hãy hỏi thêm nếu thiếu ngân sách hoặc nhu cầu.
- Khi đã có đủ dữ liệu, trả lời ngắn gọn, rõ ràng, ưu tiên dạng danh sách.
""".strip()
)


def extract_product_ids_from_text(text: str) -> List[str]:
    product_ids = re.findall(r"/product-info/([^\)\s]+)", text or "")
    return list(dict.fromkeys(product_ids))


def build_json_response(message: str) -> str:
    payload = {
        "message": message,
        "product_ids": extract_product_ids_from_text(message),
    }
    return json.dumps(payload, ensure_ascii=False)


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


# =====================================================
# CHAT LOOP
# =====================================================

if __name__ == "__main__":
    print("PC Part Assistant ready. Type 'exit' to quit.")
    while True:
        user = input("You: ").strip()
        if not user:
            continue
        if user.lower() in {"exit", "quit"}:
            break

        result = app.invoke({"messages": [("user", user)]})
        messages = result.get("messages", [])
        final_message = messages[-1].content if messages else "Khong co phan hoi"
        print("\nBot:", final_message)
        print("-" * 60)