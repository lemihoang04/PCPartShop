import os
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.graph.message import add_messages
from langchain_core.tools import tool
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage
import pandas as pd

from DAL.product_dal import dal_ai_query_products, dal_get_product_by_id, dal_get_product_categories

# ================== 1. Định nghĩa State ==================
class AgentState(TypedDict):
    messages: Annotated[list, add_messages]   # lịch sử chat


def _query_products_as_df(
    category_name: str | None = None,
    keyword: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    attribute_filters: dict | None = None,
    limit: int = 30,
) -> pd.DataFrame:
    products, status = dal_ai_query_products(
        category_name=category_name,
        keyword=keyword,
        min_price=min_price,
        max_price=max_price,
        attribute_filters=attribute_filters,
        limit=limit,
    )

    if status != 200 or not products:
        return pd.DataFrame()

    df = pd.DataFrame(products)
    if "price" in df.columns:
        df["price"] = pd.to_numeric(df["price"], errors="coerce")

    return df


def _to_markdown_with_limit(df: pd.DataFrame, columns: list[str], limit: int = 20) -> str:
    if df.empty:
        return "Không có dữ liệu phù hợp."

    valid_cols = [col for col in columns if col in df.columns]
    if not valid_cols:
        valid_cols = list(df.columns)

    clipped = df[valid_cols].head(limit)

    if set(["product_id", "product_name", "price"]).issubset(valid_cols):
        lines = []
        for _, row in clipped.iterrows():
            pid = row.get("product_id", "")
            name = row.get("product_name", "")
            price = row.get("price", "")
            typ = row.get("type", "")
            lines.append(f"- [{name}](/product-info/{pid}), Giá: {price}, Loại: {typ}")
        content = "\n".join(lines)
    else:
        content = clipped.to_markdown(index=False)

    if len(df) > limit:
        content += f"\n\n(Hiển thị {limit}/{len(df)} sản phẩm. Hãy yêu cầu lọc thêm nếu bạn muốn kết quả chính xác hơn.)"

    return content

@tool
def get_all_products(limit: int = 30) -> str:
    """Lấy toàn bộ danh sách sản phẩm PC từ database dưới dạng bảng markdown."""
    df = _query_products_as_df(limit=limit)
    if df.empty:
        return "Không có sản phẩm nào trong database."

    display_cols = ["product_id", "product_name", "price", "type"]
    limit = max(1, min(limit, 100))
    return _to_markdown_with_limit(df, display_cols, limit)


@tool
def search_products_by_type(product_type: str, limit: int = 20) -> str:
    """Tìm sản phẩm theo loại (CPU, GPU, Mainboard, RAM, PSU, Case...). 
    product_type nên là giá trị chính xác từ cột 'type'."""
    df = _query_products_as_df(category_name=product_type, limit=limit)
    if df.empty:
        return f"Không tìm thấy sản phẩm loại '{product_type}'."

    limit = max(1, min(limit, 100))
    return _to_markdown_with_limit(df, ["product_id", "product_name", "price", "type"], limit)


@tool
def search_products_by_keyword(keyword: str, limit: int = 20) -> str:
    """Tìm sản phẩm theo từ khóa trong tên sản phẩm."""
    keyword = (keyword or "").strip()
    if not keyword:
        return "Vui lòng cung cấp từ khóa để tìm sản phẩm."

    df = _query_products_as_df(keyword=keyword, limit=limit)
    if df.empty:
        return f"Không tìm thấy sản phẩm nào với từ khóa '{keyword}'."

    limit = max(1, min(limit, 100))
    return _to_markdown_with_limit(df, ["product_id", "product_name", "price", "type"], limit)


@tool
def search_products_by_type_and_attribute(product_type: str, attribute_name: str, attribute_value: str, limit: int = 20) -> str:
    """Tìm sản phẩm theo loại và thuộc tính.
    Ví dụ: product_type='cpu', attribute_name='brand', attribute_value='amd'."""
    product_type = (product_type or "").strip()
    attribute_name = (attribute_name or "").strip()
    attribute_value = (attribute_value or "").strip()

    if not product_type:
        return "Vui lòng cung cấp product_type."
    if not attribute_name or not attribute_value:
        return "Vui lòng cung cấp cả attribute_name và attribute_value."

    df = _query_products_as_df(
        category_name=product_type,
        attribute_filters={attribute_name: attribute_value},
        limit=limit,
    )

    if df.empty:
        return f"Không tìm thấy sản phẩm loại '{product_type}' với {attribute_name}='{attribute_value}'."

    limit = max(1, min(limit, 100))
    return _to_markdown_with_limit(df, ["product_id", "product_name", "price", "type"], limit)


def _recommend_component(product_type: str, budget: float, preferred_brand: str | None = None) -> dict:
    if budget <= 0:
        return {"product": None, "budget": budget}

    filters = {"brand": preferred_brand} if preferred_brand else None
    df = _query_products_as_df(
        category_name=product_type,
        max_price=budget,
        attribute_filters=filters,
        limit=50,
    )

    if df.empty:
        # fallback to cheapest available in category
        df = _query_products_as_df(category_name=product_type, limit=50)
        if df.empty:
            return {"product": None, "budget": budget}

    df = df[df["price"].notna()].sort_values(by="price", ascending=False)
    if df.empty:
        return {"product": None, "budget": budget}

    best = df.iloc[0]
    return {
        "product": {
            "product_id": int(best.get("product_id")),
            "product_name": str(best.get("product_name")),
            "price": float(best.get("price")),
            "type": str(best.get("type", "")),
        },
        "budget": budget,
    }


@tool
def recommend_pc_build(budget: float, preferred_brand: str | None = None) -> str:
    """Gợi ý cấu hình PC cân đối dựa trên ngân sách và hãng ưa thích."""
    if budget <= 0:
        return "Ngân sách phải lớn hơn 0."

    allocation = {
        "CPU": 0.24,
        "GPU": 0.30,
        "RAM": 0.12,
        "Storage": 0.10,
        "Mainboard": 0.12,
        "PSU": 0.07,
        "Case": 0.05,
        "CPU Cooler": 0.05,
    }

    recommendations = []
    total_cost = 0.0
    missing = []

    for part, ratio in allocation.items():
        part_budget = budget * ratio
        result = _recommend_component(part, part_budget, preferred_brand)
        product = result.get("product")
        if product:
            total_cost += product["price"]
            recommendations.append(product)
        else:
            missing.append(part)

    lines = [f"### Gợi ý cấu hình PC cho ngân sách khoảng {budget:.2f}"
             ]
    for item in recommendations:
        lines.append(
            f"- [{item['product_name']}](/product-info/{item['product_id']}), Giá: {item['price']:.2f}, Loại: {item['type']}"
        )

    lines.append(f"\nTổng chi phí dự kiến: {total_cost:.2f}")
    if missing:
        lines.append(
            f"\nChú ý: chưa tìm được sản phẩm phù hợp cho các loại: {', '.join(missing)}. Bạn có thể tăng ngân sách hoặc nêu rõ yêu cầu hơn."
        )

    return "\n".join(lines)


@tool
def search_products_by_budget(max_price: float, min_price: float = 0, product_type: str = "") -> str:
    """Tìm sản phẩm theo ngân sách, có thể lọc thêm theo loại linh kiện."""
    if max_price <= 0:
        return "max_price phải lớn hơn 0."
    if min_price < 0:
        min_price = 0
    if min_price > max_price:
        return "min_price không thể lớn hơn max_price."

    df = _query_products_as_df(
        category_name=product_type or None,
        min_price=min_price,
        max_price=max_price,
        limit=30,
    )

    if df.empty:
        return "Không tìm thấy sản phẩm phù hợp với ngân sách đã cho."

    df = df.sort_values(by="price", ascending=True)
    return _to_markdown_with_limit(df, ["product_id", "product_name", "price", "type"], 30)


@tool
def get_available_types() -> str:
    """Lấy danh sách loại sản phẩm hiện có trong hệ thống."""
    categories, status = dal_get_product_categories()
    if status != 200 or not categories:
        return "Không có dữ liệu loại sản phẩm."

    types = sorted({str(item.get("category_name", "")).lower() for item in categories if item.get("category_name")})
    if not types:
        return "Không có loại sản phẩm nào."

    return "Các loại sản phẩm hiện có: " + ", ".join(types)


@tool
def get_product_detail(product_id: int) -> str:
    """Lấy thông tin chi tiết của một sản phẩm theo product_id."""
    product, status = dal_get_product_by_id(product_id)
    if status != 200 or not product:
        return f"Không tìm thấy sản phẩm với ID {product_id}."

    lines = [
        f"- ID: {product.get('product_id')}",
        f"- Tên sản phẩm: {product.get('title')}",
        f"- Giá: {product.get('price')}",
        f"- Tồn kho: {product.get('stock')}",
        f"- Đánh giá: {product.get('rating')}",
        f"- Loại: {product.get('category_id')}",
    ]

    attributes = product.get('attributes', {}) or {}
    if attributes:
        lines.append("- Thuộc tính:")
        for key, value in attributes.items():
            lines.append(f"  - {key}: {value}")

    return "\n".join(lines)


# ================== 3. Tạo Agent Node ==================
def create_pc_product_agent():
    products, status = dal_ai_query_products(limit=1)
    if status != 200 or not products:
        raise ValueError("Database không có sản phẩm nào.")

    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise ValueError("Thiếu GROQ_API_KEY trong biến môi trường.")

    llm = ChatGroq(
        groq_api_key=groq_api_key,
        model_name=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        temperature=0.1,
    )

    tools = [
        get_all_products,
        search_products_by_type,
        search_products_by_type_and_attribute,
        search_products_by_keyword,
        search_products_by_budget,
        recommend_pc_build,
        get_available_types,
        get_product_detail,
    ]

    # Bind tools vào LLM
    llm_with_tools = llm.bind_tools(tools)

    # System prompt chi tiết (tương tự prefix cũ của bạn)
    system_prompt = SystemMessage(content="""
Bạn là chuyên gia tư vấn linh kiện PC tại Techshop (hỗ trợ build PC).
Hãy trả lời thân thiện, chính xác và sử dụng dữ liệu từ các tools.

**Quy tắc quan trọng:**
- Không trả lời các câu hỏi không liên quan đến shop hoặc sản phẩm PC như thời tiết, tin tức, v.v.
- Với mọi câu hỏi liên quan sản phẩm/giá/tồn tại trong cửa hàng, luôn gọi tools trước khi trả lời.
- Khi liệt kê sản phẩm, dùng định dạng Markdown dễ đọc, không hiển thị cột product_id , ở cột product_name thì clickable dựa vào link /product-info/{product_id}
- Nếu người dùng chào hỏi (hi, hello), trả lời lịch sự và hỏi họ muốn tư vấn build PC hay tìm linh kiện gì.
- Nếu người dùng hỏi chung về danh mục, dùng tool get_available_types.
- Nếu người dùng nêu ngân sách, dùng tool search_products_by_budget.
- Nếu người dùng muốn lọc theo hãng/thuộc tính (ví dụ CPU AMD), dùng tool search_products_by_type_and_attribute.
- Nếu người dùng muốn tư vấn build PC, dùng tool recommend_pc_build và tạo danh sách cấu hình cân đối.
- Nếu chưa đủ thông tin để tư vấn build PC (ngân sách, nhu cầu, độ phân giải, phần mềm), hãy hỏi thêm ngắn gọn.
- Khi recommend, đưa link dạng /product-info/{product_id} nếu có thể.
""")

    def agent_node(state: AgentState):
        # Thêm system prompt vào đầu nếu cần
        messages = [system_prompt] + state["messages"]
        response = llm_with_tools.invoke(messages)
        return {"messages": [response]}

    # ================== 4. Xây dựng Graph (LangGraph) ==================
    workflow = StateGraph(AgentState)

    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", ToolNode(tools))

    workflow.add_edge(START, "agent")
    workflow.add_conditional_edges(
        "agent",
        tools_condition,          # tự động quyết định có gọi tool không
        {"tools": "tools", "__end__": END}
    )
    workflow.add_edge("tools", "agent")   # sau khi gọi tool thì quay lại agent suy nghĩ tiếp

    app = workflow.compile()

    return app   # Trả về runnable để invoke sau