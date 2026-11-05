from django.apps import AppConfig

from core.kernel.registry import SettingsSection


class OrgConfig(AppConfig):
    name = "core.org"
    label = "org"
    verbose_name = "ساختار سازمانی"
    nikyar_permissions = {
        "org.view": "مشاهده‌ی ساختار سازمانی",
        "org.manage": "تعریف واحدها، سمت‌ها و انتصاب‌ها",
    }
    nikyar_settings = [
        SettingsSection(
            code="org-profile",
            title="مشخصات سازمان",
            description="در صفحه‌ی ورود، نوار بالا و سربرگ چاپ‌ها نمایش داده می‌شود.",
            serializer="core.org.sections.OrgProfileSettings",
        ),
        SettingsSection(
            code="fiscal-year",
            title="سال مالی",
            description="مبنای شماره‌گذاری اسناد و گزارش‌های سالانه.",
            serializer="core.org.sections.FiscalYearSettings",
        ),
    ]
