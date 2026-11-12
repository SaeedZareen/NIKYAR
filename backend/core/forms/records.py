"""منبع «ثبت‌های فرم» برای فیلد «ارجاع به ثبت یا درخواست» (nikyar_record_sources؛ core/kernel/registry.py)."""

from .models import Form, Submission
from .service import visible_submissions


class FormRecords:
    @staticmethod
    def targets():
        return list(Form.objects.order_by("title").values_list("code", "title"))

    @staticmethod
    def selectable(user, target):
        return visible_submissions(user).filter(form__code=target, status=Submission.Status.SUBMITTED)

    @staticmethod
    def records(target, ids):
        return Submission.objects.select_related("form", "created_by").filter(form__code=target, status=Submission.Status.SUBMITTED, pk__in=ids)

    @staticmethod
    def item(obj):
        return {"id": obj.pk, "number": obj.number, "title": obj.form.title, "date": obj.submitted_at, "person": str(obj.created_by)}

    @staticmethod
    def url(obj):
        return f"/forms/submissions/{obj.pk}"
