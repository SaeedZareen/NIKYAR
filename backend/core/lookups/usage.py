"""آیا یک مقدار فهرست جایی استفاده شده است؟ ماژول‌ها چک‌کننده‌ی خود را ثبت می‌کنند."""
_checkers = []


def register_usage_checker(fn):
    """fn(item) -> bool"""
    _checkers.append(fn)
    return fn


def is_used(item) -> bool:
    return any(fn(item) for fn in _checkers)
