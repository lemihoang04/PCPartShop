import re
import json
from typing import Any, Dict, List, Optional

# =====================================================
# PRICE SEGMENT DEFINITION
# =====================================================
def price_segment(category: str, price: float) -> str:
    """Phân loại phân khúc giá theo từng category (đơn vị: USD)."""
    THRESHOLDS: dict[str, tuple[float, float, float]] = {
        "cpu":         (120, 300, 700),
        "gpu":         (200, 550, 1000),
        "ram":         (40, 120, 250),
        "mainboard":   (80, 200, 400),
        "psu":         (60, 140, 220),
        "storage":     (40, 120, 280),
        "case":        (50, 120, 250),
        "cpu_cooler":  (30, 100, 200),
    }
    budget_max, mid_max, upper_mid_max = THRESHOLDS.get(
        category, (50, 150, 300)
    )
    if price < budget_max:
        return "budget"
    elif price < mid_max:
        return "mid_range"
    elif price < upper_mid_max:
        return "upper_mid"
    else:
        return "premium"





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

VITAL_ATTRS: Dict[str, List[str]] = {
    "cpu": [
        "Core Count",
        "Performance Core Clock",
        "Performance Core Boost Clock",
        "TDP",
        "L3 Cache",
        "Memory Type",
        "Integrated Graphics",
        "Thread Count"
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
    "mainboard": [
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
    "cpu_cooler": [
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
}

MIN_BUDGETS_FOR_BUILD_PC = {
    "office": 300,
    "gaming": 550,
    "creator": 800,
    "workstation": 1200,
}

MAX_BUDGETS_FOR_BUILD_PC  = {
    "office": 1500,
    "gaming": 10000,
    "creator": 15000,
    "workstation": 20000,
}


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


# PRE-COMPILED REGEX PATTERNS FOR OPTIMIZATION
# =====================================================
_RE_MODEL_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in [
        r"\bi[3579]\s*-?\s*\d{4,5}[a-z]*\b",
        r"\bcore\s+i[3579]\s*\d{4,5}[a-z]*\b",
        r"\bryzen\s*[3579]\s*\d{3,5}[a-z0-9]*\b",
        r"\bthreadripper\s+\d+\b",
        r"\b(rtx|gtx)\s*\d{3,4}\s*(ti|super|xt)?\b",
        r"\brx\s*\d{3,4}\s*(xt|xtx)?\b",
        r"\b[bzxh]\d{3,4}[a-z]*\b",
        r"\b\d+\s*gb\s*(ddr[45])\b",
        r"\bddr[45]\s*\d+\s*gb\b",
        r"\b\d+\s*(gb|tb)\s*(nvme|ssd|m\.2)\b",
        r"\b\d{3,4}\s*w\s*(psu|nguồn)?\b",
    ]
]

_RE_GENERIC_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in [
        r"^ryzen\s*[3579]$",
        r"^intel\s+core$",
        r"^rtx\s*\d{2}\s*series$",
        r"^rx\s*\d{4}\s*series$",
        r"\b\d{2}th\s*gen\b",
        r"\bgen\s*\d+\b",
    ]
]

_RE_SPEC_GB_TB = re.compile(r"\b\d+\s*(gb|tb)\b", re.IGNORECASE)
_RE_SPEC_MHZ_W = re.compile(r"\b\d+\s*(mhz|mt/s|w)\b", re.IGNORECASE)
_RE_SPEC_CL = re.compile(r"\bcl\d+\b", re.IGNORECASE)

_RE_BUDGET_TRIEU = re.compile(r"(\d+(?:\.\d+)?)\s*(triệu|tr|củ)", re.IGNORECASE)
_RE_BUDGET_TR_FRACTION = re.compile(r"(\d+)tr(\d+)", re.IGNORECASE)
_RE_BUDGET_K = re.compile(r"(\d+(?:\.\d+)?)\s*k\b", re.IGNORECASE)
_RE_BUDGET_FORMATTED = re.compile(r"(\d{1,3}(?:[\.,]\d{3})+)", re.IGNORECASE)
_RE_NON_DIGITS = re.compile(r"[^0-9]")

_RE_EXTRACT_DIGITS = re.compile(r"\d+")
_RE_RAM_SPEED = re.compile(r"(\d+(?:\.\d+)?)$")
_RE_DDR_TYPE = re.compile(r"(DDR\d+)", re.IGNORECASE)
_RE_FLOAT_NUM = re.compile(r"([\d]+(?:[.,]\d+)?)")
_RE_MM_NUM = re.compile(r"([\d]+(?:[.,]\d+)?)\s*mm", re.IGNORECASE)
_RE_PRODUCT_LINK = re.compile(r"/product-info/([^\)\s]+)")

_BRANDS_SET = {
    "intel", "amd", "nvidia",
    "asus", "msi", "gigabyte", "asrock",
    "corsair", "kingston", "crucial",
    "samsung", "wd", "seagate",
    "noctua", "be quiet",
    "deepcool", "thermalright",
    "nzxt", "lian li",
    "fractal", "cooler master",
    "zotac", "galax", "sapphire"
}

_GENERIC_CATEGORIES_SET = {
    "cpu", "processor",
    "gpu", "vga",
    "ram", "memory",
    "ssd", "nvme", "hdd",
    "main", "mainboard",
    "psu", "nguồn",
    "case",
    "cooler", "tản nhiệt", "cpu_cooler",
    "linh kiện",
    "build",
    "cấu hình",
    "pc"
}


def detect_budget(text: str) -> Optional[int]:
    text_low = text.lower().replace(",", ".")

    # 20.5 triệu, 20tr5
    match = _RE_BUDGET_TRIEU.search(text_low)
    if match:
        return int(float(match.group(1)) * 1_000_000)

    # 20tr5
    match = _RE_BUDGET_TR_FRACTION.search(text_low)
    if match:
        return int((int(match.group(1)) + int(match.group(2)) / 10) * 1_000_000)

    # 500k
    match = _RE_BUDGET_K.search(text_low)
    if match:
        return int(float(match.group(1)) * 1_000)

    # 20,000,000
    match = _RE_BUDGET_FORMATTED.search(text_low)
    if match:
        cleaned = _RE_NON_DIGITS.sub("", match.group(1))
        return int(cleaned)

    return None


def as_vnd(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)

    digits = _RE_NON_DIGITS.sub("", str(value))
    return int(digits) if digits else None


def vnd(value: Optional[int]) -> str:
    if value is None:
        return "N/A"
    return f"{value:,}đ".replace(",", ".")


def doc_name(doc: Any) -> str:
    metadata = getattr(doc, "metadata", {}) or {}
    for key in ("name", "title", "product_name"):
        val = metadata.get(key)
        if val:
            return str(val)

    content = (getattr(doc, "page_content", "") or "").strip().splitlines()
    return content[0][:120] if content else "San pham khong ro ten"


def doc_category(doc: Any) -> str:
    metadata = getattr(doc, "metadata", {}) or {}
    return str(metadata.get("category") or "unknown")


def doc_price(doc: Any) -> Optional[int]:
    metadata = getattr(doc, "metadata", {}) or {}
    return (metadata.get("price_vnd") or metadata.get("price"))


def doc_uid(doc: Any) -> str:
    metadata = getattr(doc, "metadata", {}) or {}
    for key in ("product_id", "id", "sku", "slug", "name"):
        val = metadata.get(key)
        if val:
            return str(val)
    return doc_name(doc)


def doc_image(doc: Any) -> Optional[str]:
    metadata = getattr(doc, "metadata", {}) or {}
    image = metadata.get("image") or metadata.get("image_url")
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
        attrs = doc_filtered_attrs(doc)
        line = (
            f"[{idx}]: [{doc_name(doc)}] | "
            f"category={doc_category(doc)} | product_id={product_id}"
            f"Thông số: {attrs}"
        )
        lines.append(line)
    return "\n\n".join(lines)


def format_markdown_output(text: str) -> str:
    if not text:
        return text
    return text.strip()


def _is_generic_keyword(keyword: str) -> bool:
    if not keyword or not keyword.strip():
        return True

    text = keyword.strip().lower()
    score = 0

    # model rõ -> gần như chắc chắn specific
    if any(p.search(text) for p in _RE_MODEL_PATTERNS):
        score += 5

    # ================= BRAND =================
    if any(b in text for b in _BRANDS_SET):
        score += 2

    # ================= SPEC =================
    if _RE_SPEC_GB_TB.search(text):
        score += 1

    if _RE_SPEC_MHZ_W.search(text):
        score += 1

    if _RE_SPEC_CL.search(text):
        score += 1

    # ================= GENERIC CATEGORY =================
    if any(x in text for x in _GENERIC_CATEGORIES_SET):
        score -= 2

    # ================= GENERATION / SERIES =================
    if any(p.search(text) for p in _RE_GENERIC_PATTERNS):
        score -= 3

    # query quá ngắn
    if len(text.split()) <= 1:
        score -= 2

    # score >= 3 là đủ hẹp
    return score < 3


def extract_number(value: Any) -> float:
    if not value:
        return 0.0
    match = _RE_EXTRACT_DIGITS.search(str(value))
    return float(match.group()) if match else 0.0


def extract_ram_speed(value: Any) -> float:
    if not value:
        return 0.0
    match = _RE_RAM_SPEED.search(str(value))
    return float(match.group(1)) if match else 0.0


def _extract_ddr_type(value: str) -> Optional[str]:
    """Trích xuất DDR generation từ chuỗi như 'DDR5-5600' → 'DDR5', 'DDR4-3200' → 'DDR4'."""
    m = _RE_DDR_TYPE.match(str(value).strip())
    if m:
        return m.group(1).upper()
    return None


def _extract_number(value: Any) -> Optional[float]:
    """Trích xuất giá trị số đầu tiên tìm thấy trong chuỗi hoặc trả về float/int nếu đã là số."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    m = _RE_FLOAT_NUM.search(str(value))
    if m:
        return float(m.group(1).replace(",", "."))
    return None


def _extract_mm(value: str) -> Optional[float]:
    """Trích xuất giá trị số mm từ chuỗi như '267 mm', '400 mm / 15.748\"', '15.748\"'."""
    val_str = str(value)
    m = _RE_MM_NUM.search(val_str)
    if m:
        return float(m.group(1).replace(",", "."))
    m = _RE_FLOAT_NUM.search(val_str)
    if m:
        return float(m.group(1).replace(",", "."))
    return None


def doc_filtered_attrs(doc: Any) -> str:
    metadata = getattr(doc, "metadata", {}) or {}
    attrs_str = metadata.get("attrs_json", "{}")
    category = metadata.get("category", "")
    try:
        attrs = json.loads(attrs_str)
    except Exception:
        attrs = {}

    vitals = VITAL_ATTRS.get(category)
    if vitals:
        filtered = {k: v for k, v in attrs.items() if k in vitals}
        return json.dumps(filtered, ensure_ascii=False)

    return attrs_str


def extract_product_ids_from_text(text: str) -> List[str]:
    product_ids = _RE_PRODUCT_LINK.findall(text or "")
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


def _extract_compat_values(attrs: Dict[str, Any], category: str) -> Dict[str, str]:
    """Trích xuất các giá trị tương thích từ attrs, logic giống update_compat_info."""
    info: Dict[str, str] = {}
    for k, v in attrs.items():
        if k in ["Socket/CPU", "Socket", "CPU Socket"]:
            info["Socket"] = str(v)
        elif k in ["Type", "Memory Type"] and category in ["ram", "cpu", "mainboard"]:
            info["Memory Type"] = str(v)
        elif k == "Speed" and category == "ram":
            ddr = _extract_ddr_type(str(v))
            if ddr and "Memory Type" not in info:
                info["Memory Type"] = ddr
        elif k in ["Motherboard Form Factor", "Form Factor"] and category not in ["ram", "storage"]:
            info["Form Factor"] = str(v)
        elif k in ["Length", "Maximum Video Card Length"]:
            info["Length"] = str(v)
    return info


_COMPAT_KEY_MAP = {
    "Socket": "Socket", "Socket/CPU": "Socket", "CPU Socket": "Socket",
    "Memory Type": "Memory Type", "Type": "Memory Type",
    "Form Factor": "Form Factor", "Motherboard Form Factor": "Form Factor",
    "Length": "Length", "Maximum Video Card Length": "Length",
}

_COMPAT_KEY_ALIASES: Dict[str, List[str]] = {
    "Socket":      ["Socket", "Socket/CPU", "CPU Socket"],
    "Memory Type": ["Memory Type", "Type", "Speed"],
    "Form Factor": ["Form Factor", "Motherboard Form Factor"],
    "Length":      ["Length", "Maximum Video Card Length"],
}



