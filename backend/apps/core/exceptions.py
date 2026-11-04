"""ترجمه‌ی پیام‌های خطای رایج API به فارسی."""
from rest_framework import exceptions
from rest_framework.views import exception_handler

MESSAGES = {
    exceptions.NotAuthenticated: "ابتدا وارد سامانه شوید.",
    exceptions.AuthenticationFailed: "اطلاعات ورود نامعتبر است.",
    exceptions.PermissionDenied: "شما به این بخش دسترسی ندارید.",
    exceptions.NotFound: "مورد درخواستی یافت نشد.",
    exceptions.MethodNotAllowed: "این عملیات مجاز نیست.",
}


def persian_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None
    for cls, msg in MESSAGES.items():
        if isinstance(exc, cls) and not getattr(exc, "nikyar_custom", False):
            # اگر پیام سفارشی فارسی داده شده باشد، همان را نگه می‌داریم
            detail = response.data.get("detail") if isinstance(response.data, dict) else None
            if detail is None or str(detail) == str(cls.default_detail):
                response.data = {"detail": msg}
            break
    return response
