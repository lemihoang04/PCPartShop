import os
from pathlib import Path
from dotenv import load_dotenv

from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_google_genai import ChatGoogleGenerativeAI

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent / ".env")

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
        temperature=0.1,
    )

embedding = HuggingFaceEmbeddings(model_name="BAAI/bge-m3")
db = Chroma(
    persist_directory=PERSIST_DIR,
    collection_name=COLLECTION_NAME,
    embedding_function=embedding,
)

faq_db = Chroma(
    persist_directory=PERSIST_DIR,
    collection_name="shop_faq",
    embedding_function=embedding,
)

# =====================================================
# DOCS & BM25 RETRIEVER CACHE
# =====================================================
import pickle
from typing import Dict, List, Optional, Any
from langchain_community.retrievers import BM25Retriever

_ALL_DOCS_CACHE: Optional[List[Any]] = None
_GLOBAL_BM25_CACHE: Optional[BM25Retriever] = None
_CATEGORY_BM25_CACHE: Dict[str, BM25Retriever] = {}

def get_all_docs() -> List[Any]:
    global _ALL_DOCS_CACHE
    if _ALL_DOCS_CACHE is None:
        docs_path = str(BASE_DIR / "chroma_db" / "docs.pkl")
        try:
            with open(docs_path, "rb") as f:
                _ALL_DOCS_CACHE = pickle.load(f)
        except Exception as e:
            print(f"Error loading docs.pkl: {e}")
            _ALL_DOCS_CACHE = []
    return _ALL_DOCS_CACHE

def get_bm25_retriever(category: Optional[str] = None, k: int = 20) -> Optional[BM25Retriever]:
    global _GLOBAL_BM25_CACHE, _CATEGORY_BM25_CACHE
    all_docs = get_all_docs()
    if not all_docs:
        return None

    if category:
        cat_key = category.strip().lower()
        if cat_key not in _CATEGORY_BM25_CACHE:
            filtered_docs = [
                doc for doc in all_docs
                if getattr(doc, "metadata", {}).get("category") == cat_key
            ]
            if not filtered_docs:
                filtered_docs = all_docs
            retriever = BM25Retriever.from_documents(filtered_docs)
            retriever.k = k
            _CATEGORY_BM25_CACHE[cat_key] = retriever
        retriever = _CATEGORY_BM25_CACHE[cat_key]
        retriever.k = k
        return retriever
    else:
        if _GLOBAL_BM25_CACHE is None:
            retriever = BM25Retriever.from_documents(all_docs)
            retriever.k = k
            _GLOBAL_BM25_CACHE = retriever
        _GLOBAL_BM25_CACHE.k = k
        return _GLOBAL_BM25_CACHE