"""مقدارهای «حساب کاربر» که این ماژول برای پیش‌پر فرم‌ساز می‌دهد (nikyar_profile_values)."""

import jdatetime


def national_code(user) -> str:
    employee = _employee(user)
    return employee.national_code if employee else ""


def _employee(user):
    return getattr(user, "employee", None) if user.is_authenticated else None


def personnel_code(user) -> str:
    employee = _employee(user)
    return employee.personnel_code if employee else ""


def hire_date(user) -> str:
    employee = _employee(user)
    return jdatetime.date.fromgregorian(date=employee.hire_date).strftime("%Y/%m/%d") if employee else ""


def employment_type(user) -> str:
    employee = _employee(user)
    return employee.employment_type.title if employee else ""


def leave_balance(user) -> str:
    """مانده‌ی مرخصی استحقاقی امسال (روز) برای نمایش فقط‌خواندنی در فرم مرخصی."""
    from .leave import balance

    employee = _employee(user)
    return str(balance(employee).normalize()) if employee else ""
