"""
قاعده‌های فرم با JsonLogic (jsonlogic.com): نمایش، الزام و فقط‌خواندنی شرطی، فیلد محاسبه‌ای و اعتبارسنجی بین فیلدها.

هر قاعده یک عبارت JsonLogic است که طراح دیداری می‌سازد، مثل {"==": [{"var": "leave_type"}, "sick"]}.
مرورگر همین عبارت‌ها را با json-logic-js و همین عملگرهای ویژه اجرا می‌کند
(frontend/src/components/form-renderer/rules.ts)؛ نمونه‌های مشترک shared/vectors/form-rules.json یکسانی دو طرف را می‌آزمایند.

جای قاعده‌ها در تعریف:
- فیلد: visible_if، required_if، readonly_if؛ بخش: visible_if
- فیلد «محاسبه‌ای»: props.formula
- فرم: rules = [{"id", "condition", "message", "field"}]؛ condition باید درست باشد وگرنه message زیر field می‌آید.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import jdatetime
from json_logic import jsonLogic
from json_logic.builtins import BUILTINS, to_bool

FIELD_CONDITIONS = ("visible_if", "required_if", "readonly_if")

# عملگرهای مجاز در تعریف فرم (زیرمجموعه‌ای که هر دو اجراکننده یکسان اجرا می‌کنند)
ALLOWED = {"and", "or", "!", "!!", "==", "!=", "<", "<=", ">", ">=", "in", "var", "+", "-", "*", "/", "if", "min", "max", "days_between", "today"}


def _jalali(value) -> jdatetime.date | None:
    try:
        y, m, d = (int(p) for p in str(value).split("/"))
        return jdatetime.date(y, m, d)
    except (TypeError, ValueError):
        return None


def _days_between(data=None, start=None, end=None, *_ignored):
    """شمار روز از start تا end، هر دو سر شامل (مثل مرخصی ۱ تا ۳ = ۳ روز)؛ تاریخ نادرست ← null."""
    a, b = _jalali(start), _jalali(end)
    if a is None or b is None:
        return None
    return (b.togregorian() - a.togregorian()).days + 1


def _today(data=None, *_ignored):
    return jdatetime.date.today().strftime("%Y/%m/%d")


OPERATIONS = {**BUILTINS, "days_between": _days_between, "today": _today}


def evaluate(logic, data: dict):
    """اجرای عبارت؛ خطای اجرا (مثلاً تقسیم بر صفر یا نوع ناسازگار) ← null."""
    try:
        return jsonLogic(logic, data, OPERATIONS)
    except (TypeError, ValueError, ZeroDivisionError, ReferenceError, ArithmeticError):
        return None


def truthy(value) -> bool:
    return to_bool(value)


def variables(logic) -> set[str]:
    """شناسه‌ی فیلدهایی که عبارت به آن‌ها اشاره می‌کند."""
    found: set[str] = set()
    if isinstance(logic, list):
        for item in logic:
            found |= variables(item)
    elif isinstance(logic, dict) and len(logic) == 1:
        op, args = next(iter(logic.items()))
        if op == "var":
            name = args[0] if isinstance(args, list) and args else args
            if isinstance(name, str):
                found.add(name.split(".")[0])
        else:
            found |= variables(args)
    return found


def check_logic(logic, known: set[str]) -> str | None:
    """ساختار عبارت و فیلدهای آن را می‌سنجد؛ پیام فارسی یا None."""
    if isinstance(logic, list):
        for item in logic:
            if msg := check_logic(item, known):
                return msg
        return None
    if isinstance(logic, dict):
        if len(logic) != 1:
            return "قاعده ساختار درستی ندارد."
        op, args = next(iter(logic.items()))
        if op not in ALLOWED:
            return f"عملگر «{op}» در قاعده پذیرفته نیست."
        if op == "var":
            name = args[0] if isinstance(args, list) and args else args
            if not isinstance(name, str) or name.split(".")[0] not in known:
                return f"قاعده به فیلد ناشناخته‌ی «{name}» اشاره می‌کند."
            return None
        return check_logic(args, known)
    if logic is None or isinstance(logic, (str, int, float, bool)):
        return None
    return "قاعده ساختار درستی ندارد."


@dataclass
class RuleState:
    """نتیجه‌ی قاعده‌ها برای یک داده: فیلدهای پنهان، الزامی و فقط‌خواندنی، و مقدار فیلدهای محاسبه‌ای."""

    hidden: set[str] = field(default_factory=set)
    required: set[str] = field(default_factory=set)
    readonly: set[str] = field(default_factory=set)
    calculated: dict[str, object] = field(default_factory=dict)


def _round(value, decimals: int):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value != value or value in (float("inf"), float("-inf")):
        return None
    rounded = round(value, decimals)
    return int(rounded) if decimals == 0 else rounded


def apply(definition: dict, data: dict) -> tuple[dict, RuleState]:
    """
    قاعده‌ها را روی داده اجرا می‌کند و داده‌ی نهایی را برمی‌گرداند: مقدار فیلدهای پنهان حذف و فیلدهای محاسبه‌ای پر می‌شوند.
    نمایش چند دور اجرا می‌شود تا زنجیره‌ها (ب وابسته به الف که خودش پنهان شده) پایدار شوند؛ محاسبه‌ها به ترتیب تعریف
    و فقط وقتی همه‌ی فیلدهای فرمول مقدار دارند.
    """
    sections = definition.get("sections", [])
    values = dict(data)
    state = RuleState()
    for _ in range(5):
        hidden: set[str] = set()
        for section in sections:
            section_hidden = "visible_if" in section and not truthy(evaluate(section["visible_if"], values))
            for f in section.get("fields", []):
                if section_hidden or ("visible_if" in f and not truthy(evaluate(f["visible_if"], values))):
                    hidden.add(f["id"])
        values = {k: v for k, v in data.items() if k not in hidden}
        for section in sections:
            for f in section.get("fields", []):
                if f["type"] == "calculated" and f["id"] not in hidden:
                    props = f.get("props", {})
                    # تا همه‌ی فیلدهای فرمول پر نشده‌اند، نتیجه‌ای نیست (نه صفر).
                    ready = all(n in values for n in variables(props.get("formula")))
                    result = _round(evaluate(props.get("formula"), values), props.get("decimals", 0)) if ready else None
                    if result is None:
                        values.pop(f["id"], None)
                    else:
                        values[f["id"]] = result
        if hidden == state.hidden:
            break
        state.hidden = hidden
    state.calculated = {f["id"]: values[f["id"]] for s in sections for f in s.get("fields", []) if f["type"] == "calculated" and f["id"] in values}
    for section in sections:
        for f in section.get("fields", []):
            if f["id"] in state.hidden:
                continue
            if "required_if" in f and truthy(evaluate(f["required_if"], values)):
                state.required.add(f["id"])
            if f.get("readonly") or ("readonly_if" in f and truthy(evaluate(f["readonly_if"], values))):
                state.readonly.add(f["id"])
    return values, state


def form_rule_errors(definition: dict, values: dict, hidden: set[str]) -> dict[str, str]:
    """
    اعتبارسنجی بین فیلدها: قاعده‌ای که شرطش نادرست است پیامش را زیر فیلد خودش می‌گذارد. قاعده‌ای که فیلدهایش
    هنوز پر نشده یا پنهان‌اند بررسی نمی‌شود (پر کردن را «الزامی» می‌سنجد).
    """
    errors: dict[str, str] = {}
    for rule in definition.get("rules", []):
        names = variables(rule["condition"])
        if any(n not in values or n in hidden for n in names):
            continue
        if not truthy(evaluate(rule["condition"], values)):
            errors.setdefault(rule.get("field") or "__form__", rule["message"])
    return errors
