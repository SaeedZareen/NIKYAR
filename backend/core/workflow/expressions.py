"""
عبارت‌های شرط فرایند (شرط مسیرهای دروازه): زیرمجموعه‌ی امن پایتون که SpiffWorkflow با آن کار می‌کند.

موتور اسکریپت پیش‌فرض SpiffWorkflow هر کد پایتون را با eval/exec اجرا می‌کند؛ اینجا هیچ eval نیست:
عبارت با ast خوانده و فقط گره‌های مجاز (مقایسه، و/یا/نه، حساب ساده، ثابت، نام فیلد، فهرست و
چند تابع مجاز) تفسیر می‌شوند. دستور (اسکریپت) پذیرفته نیست.

نام ناشناخته یا فیلد پر نشده None است؛ مقایسه‌ی ترتیبی با None «نادرست» است (مثل قاعده‌های فرم‌ساز).
"""

from __future__ import annotations

import ast
import operator

from SpiffWorkflow.bpmn.exceptions import WorkflowTaskException
from SpiffWorkflow.bpmn.script_engine import PythonScriptEngine

from core.forms.rules import _days_between, _sum_of, _today

MAX_LENGTH = 1000

FUNCTIONS = {
    "days_between": lambda start, end: _days_between(None, start, end),
    "today": lambda: _today(None),
    "sum_of": lambda rows, column, factor=None: _sum_of(None, rows, column, factor),
    "len": lambda value: len(value) if isinstance(value, (list, str, dict)) else 0,
}

_COMPARE = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
}
_ARITH = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}


class ExpressionError(ValueError):
    """عبارت نامعتبر یا ناامن؛ پیام فارسی برای طراح."""


def check(expression: str) -> ast.expr:
    """عبارت را می‌خواند و فقط اگر همه‌ی گره‌هایش مجاز باشد برمی‌گرداند."""
    if not isinstance(expression, str) or not expression.strip():
        raise ExpressionError("شرط خالی است.")
    if len(expression) > MAX_LENGTH:
        raise ExpressionError(f"شرط بیش از {MAX_LENGTH} نویسه است.")
    try:
        tree = ast.parse(expression.strip(), mode="eval")
    except SyntaxError:
        raise ExpressionError("شرط درست نوشته نشده است.") from None
    for node in ast.walk(tree):
        _check_node(node)
    return tree.body


def names(expression: str) -> set[str]:
    """نام فیلدهایی که عبارت به کار می‌برد (بی نام تابع‌ها)."""
    tree = check(expression)
    functions = {n.func.id for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)}
    return {n.id for n in ast.walk(tree) if isinstance(n, ast.Name) and n.id not in functions and n.id not in ("True", "False", "None")}


def _check_node(node: ast.AST) -> None:
    allowed = (
        ast.Expression,
        ast.BoolOp,
        ast.And,
        ast.Or,
        ast.UnaryOp,
        ast.Not,
        ast.USub,
        ast.UAdd,
        ast.Compare,
        ast.In,
        ast.NotIn,
        ast.BinOp,
        ast.Constant,
        ast.Name,
        ast.Load,
        ast.List,
        ast.Tuple,
        ast.Call,
        ast.IfExp,
        *_COMPARE,
        *_ARITH,
    )
    if not isinstance(node, allowed):
        raise ExpressionError("این شرط بخشی دارد که مجاز نیست؛ فقط مقایسه، «و/یا/نه»، حساب ساده، نام فیلدها و تابع‌های مجاز.")
    if isinstance(node, ast.Name) and node.id.startswith("_"):
        raise ExpressionError(f"نام «{node.id}» مجاز نیست.")
    if isinstance(node, ast.Constant) and not isinstance(node.value, (str, int, float, bool, type(None))):
        raise ExpressionError("مقدار ثابت شرط فقط عدد، متن، درست/نادرست یا None است.")
    if isinstance(node, ast.Call) and (not isinstance(node.func, ast.Name) or node.func.id not in FUNCTIONS or node.keywords):
        raise ExpressionError(f"تابع مجاز فقط این‌هاست: {'، '.join(sorted(FUNCTIONS))}.")


def evaluate(expression: str, data: dict):
    return _eval(check(expression), data)


def _eval(node: ast.expr, data: dict):
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        return {"True": True, "False": False, "None": None}.get(node.id, data.get(node.id))
    if isinstance(node, (ast.List, ast.Tuple)):
        return [_eval(e, data) for e in node.elts]
    if isinstance(node, ast.BoolOp):
        if isinstance(node.op, ast.And):
            result = True
            for value in node.values:
                result = _eval(value, data)
                if not result:
                    return result
            return result
        result = False
        for value in node.values:
            result = _eval(value, data)
            if result:
                return result
        return result
    if isinstance(node, ast.UnaryOp):
        value = _eval(node.operand, data)
        if isinstance(node.op, ast.Not):
            return not value
        if not _is_number(value):
            return None
        return -value if isinstance(node.op, ast.USub) else value
    if isinstance(node, ast.BinOp):
        a, b = _eval(node.left, data), _eval(node.right, data)
        if isinstance(node.op, ast.Add) and isinstance(a, str) and isinstance(b, str):
            return a + b
        if not (_is_number(a) and _is_number(b)) or (isinstance(node.op, ast.Div) and b == 0):
            return None
        return _ARITH[type(node.op)](a, b)
    if isinstance(node, ast.Compare):
        left = _eval(node.left, data)
        for op, right_node in zip(node.ops, node.comparators, strict=True):
            right = _eval(right_node, data)
            if not _compare(op, left, right):
                return False
            left = right
        return True
    if isinstance(node, ast.IfExp):
        return _eval(node.body, data) if _eval(node.test, data) else _eval(node.orelse, data)
    if isinstance(node, ast.Call):
        return FUNCTIONS[node.func.id](*[_eval(a, data) for a in node.args])
    raise ExpressionError("این شرط بخشی دارد که مجاز نیست.")


def _is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _compare(op: ast.cmpop, a, b) -> bool:
    if isinstance(op, (ast.In, ast.NotIn)):
        found = isinstance(b, (list, str)) and a is not None and (a in b if isinstance(b, list) or isinstance(a, str) else False)
        return found if isinstance(op, ast.In) else not found
    if isinstance(op, (ast.Eq, ast.NotEq)):
        return _COMPARE[type(op)](a, b)
    # ترتیب فقط میان دو عدد یا دو متن (تاریخ شمسی متن هم‌طول است)
    if (_is_number(a) and _is_number(b)) or (isinstance(a, str) and isinstance(b, str)):
        return _COMPARE[type(op)](a, b)
    return False


class SafeScriptEngine(PythonScriptEngine):
    """
    موتور اسکریپت SpiffWorkflow بدون eval/exec: فقط عبارت‌های امن و هیچ اسکریپتی.
    کار خودکار BPMN (serviceTask) به run_action(task, operation_name) می‌رسد: اقدام‌های رجیستری نیک‌یار.
    """

    def __init__(self, run_action=None, timer=None):
        super().__init__()
        self.run_action = run_action
        # timer(task) زمان پایان انتظار مرحله‌ی زمان‌بندی (ISO 8601) را برمی‌گرداند (عبارت ویژه‌ی bpmn.WAIT_EXPRESSION)
        self.timer = timer

    def validate(self, expression):
        check(expression)

    def evaluate(self, task, expression, external_context=None):
        if self.timer is not None and expression.strip() == "wait_until":
            return self.timer(task)
        try:
            return evaluate(expression, task.data)
        except ExpressionError as exc:
            raise WorkflowTaskException(str(exc), task=task, exception=exc) from None

    def execute(self, task, script, external_context=None):
        raise WorkflowTaskException("اجرای اسکریپت در فرایندهای نیک‌یار مجاز نیست.", task=task)

    def call_service(self, task, operation_name=None, **kwargs):
        if self.run_action is None:
            raise WorkflowTaskException("اقدام خودکار در این زمینه اجرا نمی‌شود.", task=task)
        self.run_action(task, operation_name)
        # نتیجه‌ی SpiffWorkflow (JSON) در داده‌ی کار؛ اقدام‌های نیک‌یار نتیجه‌ی جدا ندارند
        return "null"
