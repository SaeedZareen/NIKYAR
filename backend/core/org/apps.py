from django.apps import AppConfig


class OrgConfig(AppConfig):
    name = "core.org"
    label = "org"
    verbose_name = "ساختار سازمانی"
    nikyar_permissions = {
        "org.view": "مشاهده‌ی ساختار سازمانی",
        "org.manage": "تعریف واحدها، سمت‌ها و انتصاب‌ها",
    }
