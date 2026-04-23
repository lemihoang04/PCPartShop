from langchain_experimental.agents.agent_toolkits.pandas.base import create_pandas_dataframe_agent
from langchain_groq import ChatGroq
import pandas as pd
from DAL.product_dal import get_products_from_db_by_query

def create_product_agent():
    products = get_products_from_db_by_query()
    
    if not products or len(products) == 0:
        raise ValueError("Không có sản phẩm nào từ database → DataFrame rỗng.")
    
    df = pd.DataFrame(products)
    
    # Kiểm tra cột cần thiết để debug
    required_columns = ['product_id', 'product_name', 'price', 'type']
    missing = [col for col in required_columns if col not in df.columns]
    if missing:
        print(f"Cảnh báo: DataFrame thiếu cột {missing} → một số query có thể thất bại.")
    
    llm = ChatGroq(
        groq_api_key="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",
        model_name="llama-3.3-70b-versatile",
        temperature=0.1,
    )
    
    agent = create_pandas_dataframe_agent(
        llm=llm,
        df=df,
        verbose=True,
        agent_type="tool-calling",           # Tốt nhất cho Groq + model OpenAI-style (hỗ trợ tool calling native)
        # Nếu "tool-calling" lỗi → thử agent_type="openai-tools" hoặc "openai-functions"
        allow_dangerous_code=True,           # Bắt buộc để chạy code Python trên df
        prefix="""You are a helpful shopping assistant in Techshop. Answer questions about products using the provided pandas DataFrame.

For simple greetings like 'hi' or 'hello', respond politely and ask how you can help with finding products.

**General Query Handling:** If the user asks generally about the shop's offerings without specifying a product type (e.g. 'What do you have?', 'What products do you sell?'), 
do NOT list individual products. Instead, extract and list the **unique** values from the 'type' column. 
Example: "We offer the following types of products: Laptops, Smartphones, Keyboards, Mice."

When providing product information, use Markdown formatting. Put your final response inside [Final Answer].

**CRITICAL RULES:**
- ONLY use data from the provided DataFrame. Do NOT load files, CSVs, databases, or invent data.
- NEVER fabricate product IDs, names, prices, ratings, etc.
- Only recommend products that exist in the DataFrame with exact values.

For listings, use this exact numbered format with clickable links:
1. [Product Name](/product-info/{product_id}), Price: {price}, Rating: {rating} (nếu có)

Example:
1. [Acer Aspire 3](/product-info/3416), Price: 179.99, Rating: 5.0

Always filter by the 'type' column when relevant. Use correct product_id for links.
""",
    )
    
    return agent