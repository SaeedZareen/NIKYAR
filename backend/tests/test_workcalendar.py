from datetime import datetime

import jdatetime
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from core.audit.models import AuditLog
from core.workcalendar.models import Holiday, OfficialYear
from core.workcalendar.service import WorkCalendar, jalali_weekday


def j(y, m, d):
    return jdatetime.date(y, m, d).togregorian()


def at(y, m, d, hh, mm=0):
    return timezone.make_aware(datetime.combine(j(y, m, d), datetime.min.time().replace(hour=hh, minute=mm)))


@pytest.mark.django_db
class TestOfficialHolidays:
    def test_published_years_loaded_once_and_edits_survive(self, api):
        assert set(OfficialYear.objects.values_list("year", flat=True)) >= {1404, 1405, 1406}
        nowruz = Holiday.objects.get(date=j(1405, 1, 1))
        assert nowruz.kind == "official"
        # ویرایش سازمان در بارگذاری دوباره دست نمی‌خورد
        Holiday.objects.filter(pk=nowruz.pk).update(title="نوروز")
        r = api.post("/api/calendar/holidays/load-official/", {"year": 1405}, format="json").json()
        assert r == {"created": 0, "complete": True} and Holiday.objects.get(pk=nowruz.pk).title == "نوروز"

    def test_year_without_published_calendar_gets_fixed_solar_only(self, api):
        r = api.post("/api/calendar/holidays/load-official/", {"year": 1410}, format="json").json()
        assert r["created"] == 10 and r["complete"] is False
        assert api.get("/api/calendar/holidays/?year=1410").json()[0]["date"] == "1410/01/01"
        assert AuditLog.objects.filter(object_repr__contains="تعطیلات رسمی سال ۱۴۱۰").exists()


@pytest.mark.django_db
class TestHolidayApi:
    def test_crud_permissions_and_duplicate_date(self, api, make_user, client_for):
        r = api.post("/api/calendar/holidays/", {"date": "1405/09/20", "title": "سالروز تأسیس شرکت"}, format="json")
        assert r.status_code == 201 and r.json()["kind"] == "organization" and r.json()["kind_label"] == "خاص سازمان"
        r = api.post("/api/calendar/holidays/", {"date": "1405/09/20", "title": "تکراری"}, format="json")
        assert "سالروز تأسیس شرکت" in r.json()["fields"]["date"]
        reader = client_for(make_user("reader"))
        cal = reader.get("/api/calendar/").json()
        assert cal["work_week"][0] == {"day": 0, "start": "08:00", "end": "16:00"} and any(h["title"] == "سالروز تأسیس شرکت" for h in cal["holidays"])
        assert reader.post("/api/calendar/holidays/", {"date": "1405/09/21", "title": "x"}, format="json").status_code == 403

    def test_import_csv_with_header_errors_and_updates(self, api):
        Holiday.objects.create(date=j(1407, 1, 1), title="قدیمی")
        content = "تاریخ,عنوان,نوع\n۱۴۰۷/۰۱/۰۱,عید نوروز\n1407/07/31,روز نامعتبر\n1407/03/10,جشن سازمان,خاص سازمان\n1407/04/01\n".encode("utf-8-sig")
        r = api.post("/api/calendar/holidays/import/", {"file": SimpleUploadedFile("h.csv", content)}, format="multipart").json()
        assert r["created"] == 1 and r["updated"] == 1
        assert [e["line"] for e in r["errors"]] == [3, 5]
        assert Holiday.objects.get(date=j(1407, 1, 1)).title == "عید نوروز"
        assert Holiday.objects.get(date=j(1407, 3, 10)).kind == "organization"


@pytest.mark.django_db
class TestWorkWeekSettings:
    def test_validation_and_audit_display(self, api):
        bad = api.put("/api/settings/work-week/", {"days": [{"day": 5, "start": "13:00", "end": "08:00"}]}, format="json")
        assert bad.json()["fields"]["days"] == "ساعت پایان پنجشنبه باید بعد از ساعت شروع باشد."
        assert "دست‌کم یک روز" in api.put("/api/settings/work-week/", {"days": []}, format="json").json()["fields"]["days"]
        days = [{"day": d, "start": "07:30", "end": "15:30"} for d in range(5)] + [{"day": 5, "start": "08:00", "end": "12:00"}]
        assert api.put("/api/settings/work-week/", {"days": days[::-1]}, format="json").json()["days"] == days
        new = AuditLog.objects.get(action="update").changes["days"]["new"]
        assert new.startswith("شنبه ۰۷:۳۰–۱۵:۳۰") and new.endswith("پنجشنبه ۰۸:۰۰–۱۲:۰۰")


@pytest.mark.django_db
class TestWorkCalendar:
    """۱۴۰۵/۰۸/۱۶ شنبه است؛ تعطیلات رسمی ۱۴۰۵ از داده‌ی همراه بارگذاری شده‌اند."""

    def test_weekday_and_working_days(self):
        assert jalali_weekday(j(1405, 8, 16)) == 0
        cal = WorkCalendar()
        assert cal.is_working_day(j(1405, 8, 16))
        assert not cal.is_working_day(j(1405, 8, 21))  # پنجشنبه
        assert not cal.is_working_day(j(1405, 8, 22))  # جمعه
        assert not cal.is_working_day(j(1405, 1, 1))  # نوروز

    def test_add_working_hours_skips_nights_weekends_and_holidays(self):
        cal = WorkCalendar()
        assert cal.add_working_hours(at(1405, 8, 16, 10), 4) == at(1405, 8, 16, 14)
        # شروع پیش از ساعت کاری از ۸ شمرده می‌شود؛ باقی‌مانده به روز بعد می‌رود
        assert cal.add_working_hours(at(1405, 8, 16, 6), 10) == at(1405, 8, 17, 10)
        # چهارشنبه ۱۴:۰۰ + ۴ ساعت → شنبه ۱۰:۰۰ (پنجشنبه و جمعه کاری نیستند)
        assert cal.add_working_hours(at(1405, 8, 20, 14), 4) == at(1405, 8, 23, 10)
        Holiday.objects.create(date=j(1405, 8, 23), title="تعطیلی سازمان")
        assert WorkCalendar().add_working_hours(at(1405, 8, 20, 14), 4) == at(1405, 8, 24, 10)

    def test_add_working_days_and_thursday_half_day(self, api):
        cal = WorkCalendar()
        assert cal.add_working_days(at(1405, 8, 19, 9), 2) == at(1405, 8, 23, 16)
        days = [{"day": d, "start": "08:00", "end": "16:00"} for d in range(5)] + [{"day": 5, "start": "08:00", "end": "12:00"}]
        api.put("/api/settings/work-week/", {"days": days}, format="json")
        cal = WorkCalendar()
        assert cal.add_working_days(at(1405, 8, 19, 9), 2) == at(1405, 8, 21, 12)
        assert cal.add_working_hours(at(1405, 8, 21, 11), 2) == at(1405, 8, 23, 9)
