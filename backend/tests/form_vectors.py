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
RULES_PATH = PATH.with_name("form-rules.json")

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
                {"id": "code", "type": "text", "label": "کد پرسنلی", "props": {"pattern": "^P-\\d{3}$", "pattern_message": "کد پرسنلی به شکل P-123 است."}},
                {"id": "source", "type": "choice", "label": "منبع", "props": {"options": OPTIONS, "allow_other": True}},
                {"id": "extras", "type": "multi_choice", "label": "امکانات", "props": {"options": OPTIONS, "allow_other": True}},
                {"id": "site", "type": "url", "label": "وب‌سایت"},
                {"id": "scan", "type": "barcode", "label": "بارکد", "props": {"digits_only": True}},
                {"id": "spot", "type": "location", "label": "محل"},
                {"id": "related", "type": "record", "label": "درخواست مرتبط", "props": {"source": "form:purchase"}},
                {
                    "id": "family",
                    "type": "table",
                    "label": "افراد تحت تکفل",
                    "props": {
                        "display": "cards",
                        "item_label": "فرد",
                        "max_rows": 2,
                        "columns": [
                            {"id": "fname", "type": "text", "label": "نام", "required": True},
                            {"id": "fnid", "type": "national_code", "label": "کد ملی"},
                            {"id": "fdocs", "type": "attachment", "label": "مدارک"},
                        ],
                    },
                },
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
    {"name": "pattern and other option", "partial": True, "data": {"code": "p-12", "source": {"other": ""}, "extras": ["a", {"text": "x"}]}, "errors": None},
    {
        "name": "group items",
        "partial": False,
        "data": {
            "title": "abc",
            "price": 1,
            "ok": True,
            "eval": {"skill": "a", "team": "b"},
            "agree": True,
            "family": [{"fnid": "123"}, {"fname": "سارا"}, {"fname": "علی"}],
        },
        "errors": None,
    },
    {
        "name": "web and location",
        "partial": True,
        "data": {"site": "nikyar.ir", "scan": "12-3", "spot": {"lat": 120, "lng": 51}, "related": "خ-001"},
        "errors": None,
    },
    {
        "name": "incomplete location",
        "partial": False,
        "data": {"title": "abc", "price": 1, "ok": True, "eval": {"skill": "a", "team": "b"}, "agree": True, "spot": {"lat": 35.7}},
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
            "code": "P-123",
            "source": {"other": "دوست"},
            "extras": ["b", {"other": "پارکینگ"}],
            "site": "https://nikyar.ir/forms?a=1",
            "scan": "6260100000011",
            "spot": {"lat": 35.6892, "lng": 51.389, "accuracy": 20},
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


V = lambda name: {"var": name}  # noqa: E731

# فرم مرخصی با همه‌ی گونه‌های قاعده: نمایش و الزام شرطی، بخش شرطی، فقط‌خواندنی، محاسبه و قاعده‌ی بین فیلدها.
RULES_DEFINITION = {
    "sections": [
        {
            "id": "main",
            "title": "مرخصی",
            "columns": 2,
            "fields": [
                {
                    "id": "kind",
                    "type": "choice",
                    "label": "نوع",
                    "required": True,
                    "props": {
                        "options": [{"value": "annual", "label": "استحقاقی"}, {"value": "sick", "label": "استعلاجی"}, {"value": "hourly", "label": "ساعتی"}]
                    },
                },
                {"id": "start", "type": "date", "label": "از تاریخ", "required": True, "visible_if": {"!=": [V("kind"), "hourly"]}},
                {"id": "end", "type": "date", "label": "تا تاریخ", "required": True, "visible_if": {"!=": [V("kind"), "hourly"]}},
                {"id": "days", "type": "calculated", "label": "شمار روز", "props": {"formula": {"days_between": [V("start"), V("end")]}, "format": "days"}},
                {
                    "id": "cert",
                    "type": "text",
                    "label": "شماره‌ی گواهی پزشک",
                    "visible_if": {"==": [V("kind"), "sick"]},
                    "required_if": {"==": [V("kind"), "sick"]},
                },
                {"id": "note", "type": "text", "label": "توضیح", "default": "استحقاقی", "readonly_if": {"==": [V("kind"), "annual"]}},
                {
                    "id": "followup",
                    "type": "text",
                    "label": "پیگیری",
                    # شرط تودرتو: استعلاجی و (بیش از یک روز یا «الف» پر شده)
                    "visible_if": {"and": [{"==": [V("kind"), "sick"]}, {"or": [{">": [V("days"), 1]}, {"!!": V("a")}]}]},
                },
                {"id": "a", "type": "number", "label": "الف"},
                {"id": "b", "type": "number", "label": "ب"},
                {"id": "extra", "type": "text", "label": "توضیح الف", "visible_if": {"and": [{"!!": V("a")}, {">": [V("a"), 5]}]}},
                {"id": "total", "type": "calculated", "label": "جمع", "props": {"formula": {"+": [V("a"), V("b")]}}},
                {"id": "ratio", "type": "calculated", "label": "نسبت", "props": {"formula": {"/": [V("a"), V("b")]}, "decimals": 2}},
                {
                    "id": "items",
                    "type": "table",
                    "label": "اقلام",
                    "props": {
                        "columns": [
                            {"id": "item", "type": "text", "label": "شرح", "required": True},
                            {"id": "qty", "type": "number", "label": "تعداد"},
                            {"id": "price", "type": "amount", "label": "فی"},
                        ]
                    },
                },
                {"id": "qty_total", "type": "calculated", "label": "جمع تعداد", "props": {"formula": {"sum_of": [V("items"), "qty"]}}},
                {"id": "grand", "type": "calculated", "label": "جمع کل", "props": {"formula": {"sum_of": [V("items"), "qty", "price"]}, "format": "amount"}},
            ],
        },
        {
            "id": "hourly",
            "title": "ساعتی",
            "visible_if": {"==": [V("kind"), "hourly"]},
            "fields": [{"id": "hours", "type": "time_range", "label": "ساعت", "required": True}],
        },
    ],
    "rules": [
        {"id": "order", "condition": {">=": [V("end"), V("start")]}, "message": "«تا تاریخ» باید بعد از «از تاریخ» باشد.", "field": "end"},
        {
            "id": "annual_max",
            "condition": {"or": [{"!=": [V("kind"), "annual"]}, {"<=": [V("days"), 10]}]},
            "message": "مرخصی استحقاقی حداکثر ۱۰ روز است.",
            "field": "days",
        },
    ],
}

RULE_CASES = [
    {"name": "empty", "partial": False, "data": {}},
    {"name": "sick needs certificate", "partial": False, "data": {"kind": "sick", "start": "1405/09/01", "end": "1405/09/02"}},
    {"name": "hourly hides dates and shows section", "partial": False, "data": {"kind": "hourly", "start": "1405/09/01"}},
    {"name": "annual too long and readonly note", "partial": False, "data": {"kind": "annual", "start": "1405/09/01", "end": "1405/09/20", "note": "تغییر"}},
    {"name": "end before start", "partial": False, "data": {"kind": "sick", "start": "1405/09/05", "end": "1405/09/01", "cert": "123"}},
    {"name": "calculations", "partial": True, "data": {"a": 7, "b": 2}},
    {"name": "division by zero", "partial": True, "data": {"a": 7, "b": 0}},
    {"name": "readonly keeps default", "partial": False, "data": {"kind": "annual", "start": "1405/09/01", "end": "1405/09/05", "note": "تغییر"}},
    {
        "name": "group sums skip empty cells",
        "partial": True,
        "data": {"items": [{"item": "کاغذ", "qty": 2, "price": 1500}, {"item": "خودکار", "qty": 3}, {"item": "پوشه", "price": 900}]},
    },
    {
        "name": "group row error",
        "partial": False,
        "data": {"kind": "annual", "start": "1405/09/01", "end": "1405/09/02", "items": [{"item": "کاغذ"}, {"qty": 1}]},
    },
    {"name": "valid sick", "partial": False, "data": {"kind": "sick", "start": "1405/09/01", "end": "1405/09/03", "cert": "A-12"}},
]


def build_rules() -> dict:
    from core.forms import engine, rules
    from core.forms.fieldtypes import Ctx
    from core.kernel.api import BusinessError

    cases = []
    for case in RULE_CASES:
        values, state = rules.apply(RULES_DEFINITION, case["data"])
        try:
            cleaned, errors = engine.validate_data(RULES_DEFINITION, case["data"], Ctx(partial=case["partial"])), {}
        except BusinessError as exc:
            cleaned, errors = None, exc.fields
        cases.append(
            {
                **case,
                "hidden": sorted(state.hidden),
                "required": sorted(state.required),
                "readonly": sorted(state.readonly),
                "calculated": state.calculated,
                "cleaned": cleaned,
                "errors": errors,
            }
        )
    return {
        "description": "Generated by backend/tests/form_vectors.py; read by backend and frontend tests. Do not edit by hand.",
        "definition": RULES_DEFINITION,
        "schema": engine.compile_schema(RULES_DEFINITION),
        "draft_schema": engine.compile_schema(RULES_DEFINITION, partial=True),
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
    RULES_PATH.write_text(dump(build_rules()), encoding="utf-8")
    print(f"written {PATH} and {RULES_PATH}")
