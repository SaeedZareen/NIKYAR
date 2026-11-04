"""اعتبارسنجی داده‌های ایرانی (سمت سرور)."""
import re

_FA = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def normalize_digits(value) -> str:
    return str(value or "").translate(_FA).strip()


def is_national_id(v: str) -> bool:
    v = normalize_digits(v)
    if not re.fullmatch(r"\d{10}", v) or len(set(v)) == 1:
        return False
    s = sum(int(v[i]) * (10 - i) for i in range(9)) % 11
    c = int(v[9])
    return c == s if s < 2 else c == 11 - s


def is_mobile(v: str) -> bool:
    return bool(re.fullmatch(r"09\d{9}", normalize_digits(v)))


def is_postal_code(v: str) -> bool:
    return bool(re.fullmatch(r"\d{10}", normalize_digits(v)))


def is_iban(v: str) -> bool:
    v = normalize_digits(v).upper().replace(" ", "")
    if not re.fullmatch(r"IR\d{24}", v):
        return False
    rearranged = v[4:] + "1827" + v[2:4]  # I=18, R=27
    return int(rearranged) % 97 == 1


def is_card_number(v: str) -> bool:
    v = normalize_digits(v).replace("-", "").replace(" ", "")
    if not re.fullmatch(r"\d{16}", v):
        return False
    total = 0
    for i, ch in enumerate(v):
        d = int(ch)
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def is_email(v: str) -> bool:
    return bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", str(v or "").strip()))
