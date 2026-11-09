import json
from pathlib import Path

import jdatetime
import pytest
from jsonschema import Draft202012Validator

from core.forms import engine
from core.forms.fieldtypes import REGISTRY, Ctx
from core.kernel import validators as v
from core.kernel.api import BusinessError

VECTORS = json.loads((Path(__file__).resolve().parents[2] / "shared" / "vectors" / "ir-identifiers.json").read_text(encoding="utf-8"))
CHECKS = {
    "national_code": v.is_national_code,
    "legal_national_id": v.is_legal_national_id,
    "mobile": v.is_mobile,
    "phone": v.is_phone,
    "postal_code": v.is_postal_code,
    "card_number": v.is_card_number,
    "iban": v.is_iban,
    "email": v.is_email,
}


@pytest.mark.parametrize("kind", CHECKS)
def test_shared_identifier_vectors(kind):
    """همان نمونه‌هایی که آزمون مرورگر (validators.test.ts) می‌خواند؛ دو طرف هرگز از هم جدا نمی‌شوند."""
    for value in VECTORS[kind]["valid"]:
        assert CHECKS[kind](value), value
    for value in VECTORS[kind]["invalid"]:
        assert not CHECKS[kind](value), value


def form(*fields, columns=1):
    return {"sections": [{"id": "s1", "title": "بخش", "columns": columns, "fields": list(fields)}]}


def errors_of(definition, data, partial=False, **ctx):
    with pytest.raises(BusinessError) as exc:
        engine.validate_data(definition, data, Ctx(partial=partial, **ctx))
    return exc.value.fields


def definition_errors(definition):
    with pytest.raises(BusinessError) as exc:
        engine.check_definition(definition)
    return exc.value.fields


TODAY = jdatetime.date.today()


def jd(days=0):
    return (TODAY + jdatetime.timedelta(days=days)).strftime("%Y/%m/%d")


class TestDefinition:
    def test_every_catalogue_type_has_title_group_and_valid_minimal_field(self, db):
        minimal_props = {
            "paragraph": {"content": "متن"},
            "choice": {"options": [{"value": "a", "label": "الف"}]},
            "multi_choice": {"options": [{"value": "a", "label": "الف"}]},
            "lookup": {"list": "gender"},
            "table": {"columns": [{"id": "c", "type": "text", "label": "ستون"}]},
            "matrix": {"rows": [{"value": "r", "label": "معیار"}], "columns": [{"value": "1", "label": "ضعیف"}, {"value": "2", "label": "خوب"}]},
            "consent": {"text": "مفاد را می‌پذیرم."},
            "calculated": {"formula": {"+": [1, 2]}},
        }
        fields = [{"id": f"f_{code}", "type": code, "label": t.title, "props": minimal_props.get(code, {})} for code, t in REGISTRY.items()]
        engine.check_definition(form(*fields))
        assert all(t.title and t.group for t in REGISTRY.values())
        Draft202012Validator.check_schema(engine.compile_schema(form(*fields), title="همه‌ی نوع‌ها"))

    def test_structure_ids_types_and_props(self, db):
        assert "definition" in definition_errors({"fields": []})
        errs = definition_errors(
            form(
                {"id": "Amount", "type": "amount", "label": "مبلغ"},
                {"id": "a", "type": "text", "label": "الف"},
                {"id": "a", "type": "text", "label": "ب"},
                {"id": "x", "type": "rocket", "label": "؟"},
                {"id": "t", "type": "text", "label": " ", "color": "red"},
                {"id": "n", "type": "number", "label": "عدد", "props": {"decimals": 9, "min": 10, "max": 5}},
                {"id": "c", "type": "choice", "label": "انتخاب", "props": {"options": [{"value": "a", "label": "الف"}, {"value": "a", "label": "ب"}]}},
                {"id": "l", "type": "lookup", "label": "فهرست", "props": {"list": "no-such-list"}},
                {"id": "h", "type": "heading", "label": "عنوان", "required": True},
                {"id": "w", "type": "text", "label": "پهن", "span": 2},
                {"id": "d", "type": "date", "label": "تاریخ", "default": "1405/01/01"},
                {"id": "m", "type": "multi_choice", "label": "چند", "props": {"options": [{"value": "a", "label": "الف"}], "max_select": 3}},
            )
        )
        p = "sections.0.fields"
        assert "حرف کوچک لاتین" in errs[f"{p}.0.id"]
        assert errs[f"{p}.2.id"] == "شناسه‌ی «a» تکراری است."
        assert "rocket" in errs[f"{p}.3.type"]
        assert errs[f"{p}.4.label"] == "برچسب فیلد الزامی است." and "color" in errs[f"{p}.4.color"]
        assert "عدد صحیح بین ۰ و ۶" in errs[f"{p}.5.props.decimals"]
        assert "تکراری" in errs[f"{p}.6.props.options"]
        assert "فهرست پایه" in errs[f"{p}.7.props.list"]
        assert "الزامی" in errs[f"{p}.8.required"]
        assert "بین ۱ و ۱" in errs[f"{p}.9.span"]
        assert "پیش‌فرض نمی‌پذیرد" in errs[f"{p}.10.default"]
        assert "از تعداد گزینه‌ها بیشتر" in errs[f"{p}.11.props.max_select"]
        # بیشینه کمتر از کمینه وقتی خود ویژگی‌ها درست باشند
        errs = definition_errors(form({"id": "n", "type": "number", "label": "عدد", "props": {"min": 10, "max": 5}}))
        assert "بزرگ‌تر یا برابر کمینه" in errs["sections.0.fields.0.props.max"]

    def test_table_columns_and_defaults(self, db):
        errs = definition_errors(
            form(
                {
                    "id": "items",
                    "type": "table",
                    "label": "اقلام",
                    "props": {"columns": [{"id": "q", "type": "number", "label": "تعداد", "span": 1}, {"id": "t", "type": "table", "label": "تو در تو"}]},
                },
                {"id": "ch", "type": "choice", "label": "انتخاب", "default": "z", "props": {"options": [{"value": "a", "label": "الف"}]}},
            )
        )
        assert "span" in errs["sections.0.fields.0.props.columns.0.span"]
        assert "در ستون جدول" in errs["sections.0.fields.0.props.columns.1.type"]
        assert "سازگار نیست" in errs["sections.0.fields.1.default"]


class TestSchemaAndData:
    def test_compiled_schema_is_standard_and_partial_drops_required(self):
        d = form(
            {"id": "title", "type": "text", "label": "عنوان", "help": "عنوان کوتاه", "required": True, "default": "خرید"},
            {"id": "sign", "type": "signature", "label": "امضا", "required": True},
            {"id": "h", "type": "heading", "label": "بخش"},
        )
        s = engine.compile_schema(d, title="درخواست")
        Draft202012Validator.check_schema(s)
        assert s["$schema"].endswith("2020-12/schema") and s["title"] == "درخواست" and s["required"] == ["title"]
        assert s["properties"]["title"] == {
            "type": "string",
            "maxLength": 200,
            "title": "عنوان",
            "x-nikyar-type": "text",
            "description": "عنوان کوتاه",
            "default": "خرید",
            "x-messages": {"required": "تکمیل «عنوان» الزامی است.", "invalid": "مقدار «عنوان» معتبر نیست.", "maxLength": "«عنوان» حداکثر ۲۰۰ نویسه باشد."},
        }
        assert "h" not in s["properties"] and s["properties"]["sign"]["readOnly"]
        assert "required" not in engine.compile_schema(d, partial=True)

    def test_clean_required_and_unknown(self):
        d = form({"id": "a", "type": "text", "label": "نام", "required": True}, {"id": "b", "type": "textarea", "label": "شرح"})
        assert errors_of(d, {"a": "  ", "b": ""}) == {"a": "تکمیل «نام» الزامی است."}
        assert engine.validate_data(d, {"a": "  ", "b": ""}, Ctx(partial=True)) == {}
        assert engine.validate_data(d, {"a": " علی ", "b": ""}, Ctx()) == {"a": "علی"}
        assert errors_of(d, {"a": "x", "zz": 1}) == {"zz": "این فیلد در فرم نیست."}
        with pytest.raises(BusinessError):
            engine.validate_data(d, ["not", "an", "object"], Ctx())

    def test_text_number_amount(self):
        d = form(
            {"id": "t", "type": "text", "label": "نام", "props": {"min_length": 3, "max_length": 5}},
            {"id": "n", "type": "number", "label": "وزن", "props": {"decimals": 2, "min": 0.5, "max": 100}},
            {"id": "i", "type": "number", "label": "تعداد"},
            {"id": "m", "type": "amount", "label": "مبلغ", "props": {"max": 50_000_000}},
        )
        errs = errors_of(d, {"t": "ab", "n": 1.234, "i": 2.5, "m": 60_000_000})
        assert errs == {
            "t": "«نام» دست‌کم ۳ نویسه باشد.",
            "n": "«وزن» حداکثر ۲ رقم اعشار دارد.",
            "i": "«تعداد» باید عدد باشد.",
            "m": "«مبلغ» نباید بیشتر از ۵۰٬۰۰۰٬۰۰۰ باشد.",
        }
        assert errors_of(d, {"t": "abcdef", "n": 0.1, "m": -1}) == {
            "t": "«نام» حداکثر ۵ نویسه باشد.",
            "n": "«وزن» نباید کمتر از ۰٫۵ باشد.",
            "m": "«مبلغ» نباید کمتر از ۰ باشد.",
        }
        assert engine.validate_data(d, {"t": "abc", "n": 12.5, "i": 3, "m": 1500}, Ctx()) == {"t": "abc", "n": 12.5, "i": 3, "m": 1500}
        assert errors_of(d, {"m": True}) == {"m": "«مبلغ» باید مبلغی بدون اعشار به ریال باشد."}

    def test_dates_times_and_ranges(self):
        d = form(
            {"id": "d", "type": "date", "label": "تاریخ تولد", "props": {"range": "past"}},
            {"id": "t", "type": "time", "label": "ساعت"},
            {"id": "r", "type": "date_range", "label": "مرخصی", "props": {"range": "future", "max_days": 3}},
        )
        errs = errors_of(d, {"d": jd(1), "t": "25:00", "r": {"start": jd(5), "end": jd(2)}})
        assert errs == {
            "d": "«تاریخ تولد» نباید بعد از امروز باشد.",
            "t": "«ساعت» ساعت معتبری نیست؛ به شکل ۰۸:۳۰ وارد کنید.",
            "r": "در «مرخصی»، «تا تاریخ» باید بعد از «از تاریخ» یا همان روز باشد.",
        }
        assert errors_of(d, {"d": "1405/13/01", "r": {"start": jd(1), "end": jd(4)}}) == {
            "d": "«تاریخ تولد» تاریخ معتبری نیست؛ به شکل ۱۴۰۵/۰۸/۱۴ وارد کنید.",
            "r": "«مرخصی» حداکثر ۳ روز است.",
        }
        assert errors_of(d, {"r": {"start": jd(-1), "end": jd(1)}}) == {"r": "«مرخصی» نباید پیش از امروز باشد."}
        assert errors_of(d, {"r": {"start": jd(1)}}) == {"r": "تکمیل «مرخصی» (از تاریخ و تا تاریخ) الزامی است."}
        assert errors_of(d, {"r": {"start": "1405/13/01", "end": jd(1)}}) == {"r": "«مرخصی» را به شکل «از تاریخ» و «تا تاریخ» معتبر وارد کنید."}
        assert engine.validate_data(d, {"r": {"start": jd(1), "end": ""}}, Ctx(partial=True)) == {"r": {"start": jd(1)}}
        ok = {"d": jd(0), "t": "08:30", "r": {"start": jd(1), "end": jd(3)}}
        assert engine.validate_data(d, ok, Ctx()) == ok

    def test_choices_and_identifiers(self):
        opts = [{"value": "a", "label": "الف"}, {"value": "b", "label": "ب"}, {"value": "c", "label": "ج"}]
        d = form(
            {"id": "yes", "type": "boolean", "label": "موافقم"},
            {"id": "one", "type": "choice", "label": "نوع", "props": {"options": opts}},
            {"id": "many", "type": "multi_choice", "label": "روزها", "props": {"options": opts, "min_select": 2, "max_select": 2}},
            *({"id": code, "type": code, "label": REGISTRY[code].title} for code in CHECKS),
        )
        bad = {"yes": "true", "one": "z", "many": ["a"], **{code: VECTORS[code]["invalid"][0] for code in CHECKS}}
        errs = errors_of(d, bad)
        assert errs["yes"] == "مقدار «موافقم» معتبر نیست."
        assert errs["one"] == "گزینه‌ی انتخاب‌شده برای «نوع» معتبر نیست."
        assert errs["many"] == "برای «روزها» دست‌کم ۲ گزینه انتخاب کنید."
        assert set(CHECKS) <= set(errs) and "کد ملی" in errs["national_code"]
        assert errors_of(d, {"many": ["a", "b", "c"]})["many"] == "برای «روزها» حداکثر ۲ گزینه انتخاب کنید."
        assert errors_of(d, {"many": ["a", "a"]})["many"] == "در «روزها» مورد تکراری هست."
        # پیش‌نویس حداقل انتخاب را نمی‌خواهد
        assert engine.validate_data(d, {"many": ["a"]}, Ctx(partial=True)) == {"many": ["a"]}
        good = {"yes": False, "one": "b", "many": ["a", "c"], **{code: VECTORS[code]["valid"][0] for code in CHECKS}}
        assert engine.validate_data(d, good, Ctx()) == good


@pytest.mark.django_db
class TestReferencesAndTables:
    def test_system_references(self, make_user):
        from core.lookups.models import LookupItem
        from core.org.models import OrgUnit, Position

        user, gone = make_user("u1"), make_user("u2", is_active=False)
        unit = OrgUnit.objects.create(name="مالی")
        pos = Position.objects.create(title="کارشناس", unit=unit)
        LookupItem.objects.filter(list__code="gender", code="female").update(is_active=False)
        d = form(
            {"id": "lk", "type": "lookup", "label": "جنسیت", "props": {"list": "gender"}},
            {"id": "us", "type": "user", "label": "همکاران", "props": {"multiple": True}},
            {"id": "un", "type": "org_unit", "label": "واحد"},
            {"id": "po", "type": "position", "label": "سمت"},
        )
        ok = {"lk": "male", "us": [user.pk], "un": unit.pk, "po": pos.pk}
        assert engine.validate_data(d, ok, Ctx()) == ok
        errs = errors_of(d, {"lk": "female", "us": [user.pk, gone.pk], "un": 999, "po": "x"})
        assert errs["lk"] == "مورد انتخاب‌شده برای «جنسیت» پیدا نشد یا غیرفعال است."
        assert "همکاران" in errs["us"] and "واحد" in errs["un"]
        assert errs["po"] == "مقدار «سمت» معتبر نیست."
        assert errors_of(d, {"us": user.pk})["us"] == "مقدار «همکاران» معتبر نیست."

    def test_table_rows_cells_and_counts(self):
        d = form(
            {
                "id": "items",
                "type": "table",
                "label": "اقلام",
                "required": True,
                "props": {
                    "min_rows": 1,
                    "max_rows": 3,
                    "columns": [
                        {"id": "name", "type": "text", "label": "شرح", "required": True},
                        {"id": "qty", "type": "number", "label": "تعداد", "props": {"min": 1}},
                        {"id": "unit", "type": "lookup", "label": "واحد شمارش", "props": {"list": "gender"}},
                    ],
                },
            }
        )
        assert errors_of(d, {"items": [{"name": "", "qty": ""}]}) == {"items": "«اقلام» دست‌کم یک ردیف داشته باشد."}
        errs = errors_of(d, {"items": [{"name": "کاغذ", "qty": 0}, {"qty": 2}, {"name": "x", "unit": "nope"}]})
        assert errs == {"items.0.qty": "ردیف ۱: «تعداد» نباید کمتر از ۱ باشد.", "items.1.name": "ردیف ۲: تکمیل «شرح» الزامی است."}
        errs = errors_of(d, {"items": [{"name": "x", "unit": "nope"}]})
        assert errs == {"items.0.unit": "ردیف ۱: مورد انتخاب‌شده برای «واحد شمارش» پیدا نشد یا غیرفعال است."}
        assert errors_of(d, {"items": [{"name": str(i)} for i in range(4)]}) == {"items": "«اقلام» حداکثر ۳ ردیف داشته باشد."}
        assert errors_of(d, {"items": [{"name": "x", "color": "red"}]}) == {"items": "مقدار «اقلام» معتبر نیست."}
        rows = [{"name": "کاغذ A4", "qty": 10, "unit": "male"}, {"name": "", "qty": None}]
        assert engine.validate_data(d, {"items": rows}, Ctx()) == {"items": [rows[0]]}


def test_shared_form_validation_vectors_are_current():
    """نمونه‌های مشترک با خروجی فعلی موتور یکی است (اگر نه: ../.venv/bin/python -m tests.form_vectors)."""
    from tests import form_vectors

    assert form_vectors.PATH.read_text(encoding="utf-8") == form_vectors.dump(form_vectors.build())
    assert form_vectors.RULES_PATH.read_text(encoding="utf-8") == form_vectors.dump(form_vectors.build_rules())


class TestSpecialisedFields:
    """نوع‌های 3.3a: خط نوشتار، شناسه‌های تازه، تاریخ و ساعت، بازه‌ی ساعت، طیف، ماتریس و تعهد."""

    def test_script_and_new_identifiers(self):
        d = form(
            {"id": "fa", "type": "text", "label": "نام", "props": {"script": "persian"}},
            {"id": "en", "type": "text", "label": "نام لاتین", "props": {"script": "latin"}},
            {"id": "eco", "type": "economic_code", "label": "کد اقتصادی"},
            {"id": "reg", "type": "registration_number", "label": "شماره‌ی ثبت"},
            {"id": "plate", "type": "vehicle_plate", "label": "پلاک"},
        )
        errs = errors_of(d, {"fa": "Ali", "en": "علی", "eco": "123", "reg": "12a", "plate": "12X345-67"})
        assert errs == {
            "fa": "«نام» را فقط با حروف فارسی بنویسید.",
            "en": "«نام لاتین» را فقط با حروف لاتین (انگلیسی) بنویسید.",
            "eco": "«کد اقتصادی» باید ۱۰ تا ۱۲ رقم باشد.",
            "reg": "«شماره‌ی ثبت» فقط رقم است (حداکثر ۱۰ رقم).",
            "plate": "«پلاک» را کامل وارد کنید: دو رقم، حرف، سه رقم و کد شهر.",
        }
        ok = {"fa": "زهرا موسوی‌نژاد", "en": "Zahra Mousavi-Nejad", "eco": "10100387221", "reg": "12345", "plate": "12الف345-67"}
        assert engine.validate_data(d, ok, Ctx()) == ok

    def test_datetime_and_time_range(self):
        d = form(
            {"id": "at", "type": "datetime", "label": "زمان حادثه", "props": {"range": "past", "default_now": True}},
            {"id": "work", "type": "time_range", "label": "ساعت کار", "props": {"max_minutes": 240}},
            {"id": "night", "type": "time_range", "label": "شیفت شب", "props": {"overnight": True}},
        )
        future = (jdatetime.datetime.now() + jdatetime.timedelta(days=1)).strftime("%Y/%m/%d %H:%M")
        errs = errors_of(d, {"at": future, "work": {"start": "12:00", "end": "08:00"}, "night": {"start": "22:00", "end": "22:00"}})
        assert errs == {
            "at": "«زمان حادثه» نباید بعد از اکنون باشد.",
            "work": "در «ساعت کار»، «تا ساعت» باید بعد از «از ساعت» باشد.",
            "night": "در «شیفت شب»، «از ساعت» و «تا ساعت» یکی است.",
        }
        assert errors_of(d, {"at": "1405/08/14", "work": {"start": "08:00", "end": "12:30"}}) == {
            "at": "«زمان حادثه» را با تاریخ و ساعت کامل وارد کنید (مثل ۱۴۰۵/۰۸/۱۴ ۰۸:۳۰).",
            "work": "«ساعت کار» حداکثر ۴ ساعت است.",
        }
        ok = {"at": "1405/08/14 08:30", "work": {"start": "08:00", "end": "11:45"}, "night": {"start": "22:00", "end": "06:00"}}
        assert engine.validate_data(d, ok, Ctx()) == ok

    def test_scale_matrix_and_consent(self):
        cols = [{"value": "1", "label": "ضعیف"}, {"value": "2", "label": "متوسط"}, {"value": "3", "label": "خوب"}]
        rows = [{"value": "skill", "label": "مهارت"}, {"value": "team", "label": "کار گروهی"}]
        d = form(
            {"id": "score", "type": "scale", "label": "رضایت", "props": {"max": 5, "display": "stars"}},
            {"id": "eval", "type": "matrix", "label": "ارزیابی", "required": True, "props": {"rows": rows, "columns": cols}},
            {"id": "agree", "type": "consent", "label": "تعهد", "required": True, "props": {"text": "صحت اطلاعات را تأیید می‌کنم."}},
        )
        assert errors_of(d, {"score": 6, "eval": {"skill": "3"}, "agree": False}) == {
            "score": "«رضایت» نباید بیشتر از ۵ باشد.",
            "eval": "به همه‌ی معیارهای «ارزیابی» پاسخ دهید.",
            "agree": "برای ادامه، «تعهد» را بپذیرید.",
        }
        assert errors_of(d, {"eval": {"skill": "9", "team": "1"}, "agree": True}) == {"eval": "پاسخ‌های «ارزیابی» معتبر نیست."}
        # پیش‌نویس: ماتریس نیمه‌کاره پذیرفته است
        assert engine.validate_data(d, {"eval": {"skill": "3"}}, Ctx(partial=True)) == {"eval": {"skill": "3"}}
        ok = {"score": 4, "eval": {"skill": "3", "team": "2"}, "agree": True}
        assert engine.validate_data(d, ok, Ctx()) == ok
        errs = definition_errors(form({"id": "s", "type": "scale", "label": "امتیاز", "props": {"min": 0, "display": "stars"}}))
        assert "ستاره" in errs["sections.0.fields.0.props.min"]


class TestRuleDefinitions:
    """قاعده‌ها فقط به فیلدهای همین فرم و عملگرهای مجاز اشاره می‌کنند (رفتار اجرا در نمونه‌های مشترک form-rules.json)."""

    def test_invalid_logic_and_form_rules(self, db):
        d = form(
            {"id": "a", "type": "number", "label": "الف", "visible_if": {"==": [{"var": "ghost"}, 1]}},
            {"id": "b", "type": "number", "label": "ب", "required_if": {"eval": ["x"]}},
            {"id": "c", "type": "calculated", "label": "ج", "props": {"formula": {"+": [{"var": "c"}, 1]}}},
        )
        d["rules"] = [{"id": "r1", "condition": {">": [{"var": "a"}, 1]}, "message": "", "field": "zz"}, {"id": "r1", "condition": None, "message": "پیام"}]
        errs = definition_errors(d)
        assert "ghost" in errs["sections.0.fields.0.visible_if"]
        assert "eval" in errs["sections.0.fields.1.required_if"]
        assert "«c»" in errs["sections.0.fields.2.props.formula"]

        d = form({"id": "a", "type": "number", "label": "الف"})
        d["rules"] = [{"id": "r1", "condition": {">": [{"var": "a"}, 1]}, "message": "", "field": "zz"}, {"id": "r1", "condition": None, "message": "پیام"}]
        errs = definition_errors(d)
        assert "پیام قاعده" in errs["rules.0.message"] and "در فرم نیست" in errs["rules.0.field"]
        assert errs["rules.1.id"] == "شناسه‌ی «r1» تکراری است." and "شرط" in errs["rules.1.condition"]

    def test_readonly_keeps_previous_value(self):
        d = form(
            {"id": "kind", "type": "text", "label": "نوع"}, {"id": "note", "type": "text", "label": "یادداشت", "readonly_if": {"==": [{"var": "kind"}, "x"]}}
        )
        assert engine.validate_data(d, {"kind": "x", "note": "تازه"}, Ctx(previous={"note": "قبلی"})) == {"kind": "x", "note": "قبلی"}
        assert engine.validate_data(d, {"kind": "x", "note": "تازه"}, Ctx()) == {"kind": "x"}
        assert engine.validate_data(d, {"kind": "y", "note": "تازه"}, Ctx()) == {"kind": "y", "note": "تازه"}


def test_layout_keys(db):
    d = form(
        {"id": "a", "type": "text", "label": "الف", "new_row": True},
        {"id": "b", "type": "choice", "label": "ب", "props": {"options": [{"value": "x", "label": "x"}], "option_columns": "3"}},
    )
    d["sections"][0]["labels"] = "top"
    engine.check_definition(d)
    d["sections"][0]["labels"] = "left"
    d["sections"][0]["fields"][0]["new_row"] = "yes"
    errs = definition_errors(d)
    assert "جای برچسب" in errs["sections.0.labels"] and "ردیف تازه" in errs["sections.0.fields.0.new_row"]
