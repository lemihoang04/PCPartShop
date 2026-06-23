import os
from pathlib import Path

from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_nvidia_ai_endpoints import ChatNVIDIA

BASE_DIR = Path(__file__).resolve().parent
COLLECTION_NAME = "pc_products"
PERSIST_DIR = str(BASE_DIR / "chroma_db")

MODEL_NAME = os.getenv(
    "NVIDIA_MODEL",
    "moonshotai/kimi-k2.6"
)

def get_llm() -> ChatNVIDIA:
    nvidia_api_key = os.getenv("NVIDIA_API_KEY")

    if not nvidia_api_key:
        raise ValueError("Thiếu NVIDIA_API_KEY trong biến môi trường.")

    return ChatNVIDIA(
        api_key=nvidia_api_key,
        model=MODEL_NAME,
        temperature=0.1,
    )

embedding = HuggingFaceEmbeddings(
    model_name="intfloat/multilingual-e5-large-instruct"
)

db = Chroma(
    persist_directory=PERSIST_DIR,
    collection_name=COLLECTION_NAME,
    embedding_function=embedding,
)