"""مقدارهای «حساب کاربر» که این ماژول برای پیش‌پر فرم‌ساز می‌دهد (nikyar_profile_values)."""


def national_code(user) -> str:
    employee = getattr(user, "employee", None) if user.is_authenticated else None
    return employee.national_code if employee else ""
