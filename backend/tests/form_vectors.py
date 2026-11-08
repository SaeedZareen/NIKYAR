"""
نمونه‌های مشترک اعتبارسنجی فرم (shared/vectors/form-validation.json): یک تعریف، طرح‌های ساخته‌شده از آن و
داده‌هایی با خطاهای مورد انتظار. آزمون سرور (test_forms_engine.py) و آزمون مرورگر
(frontend/src/components/form-renderer/validate.test.ts) هر دو همین فایل را می‌خوانند.

ساخت دوباره پس از تغییر پیام‌ها یا طرح نوع‌ها:  cd backend && ../.venv/bin/python -m tests.form_vectors
فقط خطاهایی اینجا می‌آیند که مرورگر هم می‌تواند بسنجد (نه بررسی‌های فقط-سروری مثل وجود کاربر).
"""

import json
from pathlib import Path

PATH = Path(__file__).resolve().parents[2] / "shared" / "vectors" / "form-validation.json"

OPTIONS = [{"value": "a", "label": "الف"}, {"value": "b", "label": "ب"}, {"value": "c", "label": "ج"}]
ROWS = [{"value": "skill", "label": "مهارت"}, {"value": "team", "label": "کار گروهی"}]

DEFINITION = {
    "sections": [
        {
            "id": "main",
            "title": "نمونه",
            "columns": 2,
            "fields": [
                {"id": "intro", "type": "paragraph", "props": {"content": "متن راهنما"}},
                {"id": "title", "type": "text", "label": "عنوان", "required": True, "props": {"min_length": 3, "max_length": 10}},
                {"id": "notes", "type": "textarea", "label": "شرح", "props": {"max_length": 20}},
                {"id": "qty", "type": "number", "label": "تعداد", "props": {"min": 1, "max": 100}},
                {"id": "weight", "type": "number", "label": "وزن", "props": {"decimals": 2}},
                {"id": "price", "type": "amount", "label": "مبلغ", "required": True, "props": {"max": 1000000}},
                {"id": "day", "type": "date", "label": "تاریخ"},
                {"id": "at", "type": "time", "label": "ساعت"},
                {"id": "ok", "type": "boolean", "label": "تأیید", "required": True},
                {"id": "kind", "type": "choice", "label": "نوع", "props": {"options": OPTIONS}},
                {"id": "tags", "type": "multi_choice", "label": "برچسب‌ها", "props": {"options": OPTIONS, "min_select": 2, "max_select": 2}},
                {"id": "nid", "type": "national_code", "label": "کد ملی"},
                {"id": "mobile", "type": "mobile", "label": "موبایل"},
                {"id": "email", "type": "email", "label": "ایمیل"},
                {"id": "sheba", "type": "iban", "label": "شبا"},
                {"id": "name_fa", "type": "text", "label": "نام", "props": {"script": "persian"}},
                {"id": "name_en", "type": "text", "label": "نام لاتین", "props": {"script": "latin"}},
                {"id": "eco", "type": "economic_code", "label": "کد اقتصادی"},
                {"id": "plate", "type": "vehicle_plate", "label": "پلاک"},
                {"id": "when", "type": "datetime", "label": "زمان"},
                {"id": "shift", "type": "time_range", "label": "شیفت"},
                {"id": "score", "type": "scale", "label": "امتیاز", "props": {"max": 5}},
                {"id": "eval", "type": "matrix", "label": "ارزیابی", "required": True, "props": {"rows": ROWS, "columns": OPTIONS}},
                {"id": "agree", "type": "consent", "label": "تعهد", "required": True, "props": {"text": "می‌پذیرم"}},
                {"id": "place", "type": "region", "label": "محل"},
                {"id": "drawn", "type": "signature_pad", "label": "امضا"},
                {"id": "me", "type": "submitter", "label": "ثبت‌کننده"},
            ],
        }
    ]
}

CASES = [
    {"name": "empty final submit", "partial": False, "data": {"title": "  ", "notes": ""}, "errors": None},
    {"name": "empty draft", "partial": True, "data": {"title": "  ", "notes": ""}, "errors": {}},
    {
        "name": "type and range errors",
        "partial": False,
        "data": {
            "title": "ab",
            "notes": "x" * 21,
            "qty": 0,
            "weight": "abc",
            "price": 2000000,
            "ok": True,
            "kind": "z",
            "eval": {"skill": "a", "team": "b"},
            "agree": True,
        },
        "errors": None,
    },
    {
        "name": "formats",
        "partial": True,
        "data": {"day": "1405/13/01", "at": "24:10", "nid": "0084575949", "mobile": "0912", "email": "a@", "sheba": "IR062960000000100324200002"},
        "errors": None,
    },
    {
        "name": "specialised formats",
        "partial": True,
        "data": {"name_fa": "Ali", "name_en": "علی", "eco": "12", "plate": "12X345-67", "when": "1405/08/14", "shift": {"start": "8:00"}, "score": 7},
        "errors": None,
    },
    {
        "name": "incomplete matrix and refused consent",
        "partial": False,
        "data": {"title": "abc", "price": 1, "ok": True, "eval": {"skill": "a"}, "agree": False},
        "errors": None,
    },
    {
        "name": "incomplete region and bad signature id",
        "partial": False,
        "data": {"title": "abc", "price": 1, "ok": True, "eval": {"skill": "a", "team": "b"}, "agree": True, "place": {"province": "تهران"}, "drawn": "x"},
        "errors": None,
    },
    {"name": "draft with partial matrix", "partial": True, "data": {"eval": {"skill": "a"}, "shift": {"start": "08:00"}}, "errors": {}},
    {
        "name": "selection counts",
        "partial": False,
        "data": {"title": "abc", "price": 1, "ok": False, "tags": ["a"], "eval": {"skill": "a", "team": "b"}, "agree": True},
        "errors": None,
    },
    {"name": "duplicate selection", "partial": True, "data": {"tags": ["a", "a"]}, "errors": None},
    {"name": "draft skips minimum selection", "partial": True, "data": {"tags": ["a"]}, "errors": {}},
    {
        "name": "valid",
        "partial": False,
        "data": {
            "title": " خرید ",
            "qty": 3,
            "weight": 1.25,
            "price": 1500,
            "day": "1405/08/14",
            "at": "08:30",
            "ok": True,
            "kind": "b",
            "tags": ["a", "c"],
            "nid": "0084575948",
            "mobile": "09121234567",
            "email": "info@example.ir",
            "sheba": "IR062960000000100324200001",
            "name_fa": "زهرا موسوی‌نژاد",
            "name_en": "Zahra Mousavi",
            "eco": "10100387221",
            "plate": "12الف345-67",
            "when": "1405/08/14 08:30",
            "shift": {"start": "08:00", "end": "16:30"},
            "score": 4,
            "eval": {"skill": "a", "team": "c"},
            "agree": True,
        },
        "errors": {},
    },
]


def build() -> dict:
    """نمونه‌ها با خروجی واقعی موتور سرور (طرح‌ها، داده‌ی پاک‌شده و خطاها)."""
    from core.forms import engine
    from core.forms.fieldtypes import Ctx
    from core.kernel.api import BusinessError

    cases = []
    for case in CASES:
        try:
            cleaned, errors = engine.validate_data(DEFINITION, case["data"], Ctx(partial=case["partial"])), {}
        except BusinessError as exc:
            cleaned, errors = None, exc.fields
        cases.append({"name": case["name"], "partial": case["partial"], "data": case["data"], "cleaned": cleaned, "errors": errors})
    return {
        "description": "Generated by backend/tests/form_vectors.py; read by backend and frontend tests. Do not edit by hand.",
        "definition": DEFINITION,
        "schema": engine.compile_schema(DEFINITION, title="نمونه"),
        "draft_schema": engine.compile_schema(DEFINITION, title="نمونه", partial=True),
        "cases": cases,
    }


def dump(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, indent=1) + "\n"


if __name__ == "__main__":
    import os

    import django

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    django.setup()
    PATH.write_text(dump(build()), encoding="utf-8")
    print(f"written {PATH}")
