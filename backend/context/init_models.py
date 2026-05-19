import os
from pathlib import Path

from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_google_genai import ChatGoogleGenerativeAI


BASE_DIR = Path(__file__).resolve().parent
COLLECTION_NAME = "pc_products"
PERSIST_DIR = str(BASE_DIR / "chroma_db")
MODEL_NAME = os.getenv("GOOGLE_MODEL", "gemini-3.1-flash-lite")

def get_llm() -> ChatGoogleGenerativeAI:
    google_api_key = os.getenv("GOOGLE_API_KEY")
    if not google_api_key:
        raise ValueError("Thiếu GOOGLE_API_KEY trong biến môi trường.")
    

    return ChatGoogleGenerativeAI(
        api_key=google_api_key,
        model=MODEL_NAME,
        temperature=0.05,
    )

embedding = HuggingFaceEmbeddings(model_name="BAAI/bge-m3")
db = Chroma(
    persist_directory=PERSIST_DIR,
    collection_name=COLLECTION_NAME,
    embedding_function=embedding,
)
