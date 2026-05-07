import os
from pathlib import Path

from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

BASE_DIR = Path(__file__).resolve().parent
COLLECTION_NAME = "pc_products"
PERSIST_DIR = str(BASE_DIR / "chroma_db")
MODEL_NAME = os.getenv("GOOGLE_MODEL", "mercury-2")

def get_llm() -> ChatOpenAI:
    api_key = os.getenv("INCEPTION_API_KEY")
    if not api_key:
        raise ValueError("Thiếu INCEPTION_API_KEY trong biến môi trường.")
    
    return ChatOpenAI(
        api_key=api_key,
        base_url="https://api.inceptionlabs.ai/v1",
        model="mercury-2",
        temperature=0.05,
    )

embedding = HuggingFaceEmbeddings(model_name="BAAI/bge-m3")
db = Chroma(
    persist_directory=PERSIST_DIR,
    collection_name=COLLECTION_NAME,
    embedding_function=embedding,
)
