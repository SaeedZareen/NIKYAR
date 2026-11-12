from django.apps import AppConfig

from core.kernel.registry import LookupItemSpec, LookupSpec, NotificationKind, RecordSource


class FormsConfig(AppConfig):
    name = "core.forms"
    label = "forms"
    verbose_name = "فرم‌ساز"
    nikyar_permissions = {"forms.design": "طراحی فرم‌ها و دیدن همه‌ی ثبت‌ها"}
    nikyar_lookups = [
        LookupSpec(
            code="form-category",
            name="دسته‌ی فرم‌ها",
            description="گروه‌بندی فرم‌ها در فهرست «فرم‌ها».",
            items=[
                LookupItemSpec("general", "عمومی"),
                LookupItemSpec("admin", "اداری"),
                LookupItemSpec("finance", "مالی"),
                LookupItemSpec("hr", "منابع انسانی"),
            ],
        ),
    ]
    nikyar_record_sources = [RecordSource(code="form", title="ثبت‌های فرم", provider="core.forms.records.FormRecords")]
    nikyar_notifications = [
        NotificationKind(
            code="forms.submitted",
            title="تأیید ثبت فرم (به ثبت‌کننده)",
            template="فرم «{form}» ثبت شد؛ شماره‌ی پیگیری: {number}.",
            placeholders={"form": ("عنوان فرم", "درخواست خرید"), "number": ("شماره‌ی ثبت (یا —)", "خ-۱۴۰۵-۰۰۱۲")},
        ),
        NotificationKind(
            code="forms.new_submission",
            title="ثبت تازه‌ی فرم (به کاربران و نقش‌های تعیین‌شده)",
            template="ثبت تازه در فرم «{form}» از {submitter}؛ شماره: {number}.",
            placeholders={
                "form": ("عنوان فرم", "درخواست خرید"),
                "submitter": ("نام ثبت‌کننده (در فرم بی‌نام: بی‌نام)", "سارا محمدی"),
                "number": ("شماره‌ی ثبت (یا —)", "خ-۱۴۰۵-۰۰۱۲"),
            },
        ),
    ]
