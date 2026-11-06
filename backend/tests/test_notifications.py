from datetime import timedelta

import pytest
from django.utils import timezone

from core.audit.models import AuditLog
from core.jobs import service as jobs
from core.notifications.models import Notification
from core.notifications.service import notify


@pytest.mark.django_db
class TestNotify:
    def test_created_after_commit_with_template(self, make_user, django_capture_on_commit_callbacks):
        user = make_user("zahra", gender="female", first_name="زهرا", last_name="موسوی")
        with django_capture_on_commit_callbacks(execute=False) as callbacks:
            notify([user], "accounts.created", name=user.title, username=user.username)
        assert Notification.objects.count() == 0 and len(callbacks) == 1
        callbacks[0]()
        assert Notification.objects.get().text == "خانم زهرا موسوی، حساب کاربری شما در نیک‌یار ساخته شد. نام کاربری: zahra"

    def test_user_creation_and_password_change_notify(self, api, admin, client_for, make_user, django_capture_on_commit_callbacks):
        with django_capture_on_commit_callbacks(execute=True):
            r = api.post("/api/auth/users/", {"username": "newbie", "first_name": "علی", "last_name": "نو", "password": "Strong-Pass-123"}, format="json")
        uid = r.json()["id"]
        assert Notification.objects.filter(user_id=uid, kind="accounts.created").exists()
        with django_capture_on_commit_callbacks(execute=True):
            api.patch(f"/api/auth/users/{uid}/", {"password": "Another-Pass-456"}, format="json")
        text = Notification.objects.get(user_id=uid, kind="accounts.password_changed").text
        assert "توسط کاربر admin تغییر کرد" in text

        me = make_user("self")
        with django_capture_on_commit_callbacks(execute=True):
            client_for(me).post("/api/auth/session/password/", {"current_password": "Pass-1234!", "new_password": "Brand-New-789"}, format="json")
        assert "توسط خودتان" in Notification.objects.get(user=me).text

    def test_own_list_unread_count_and_read(self, client_for, make_user):
        a, b = make_user("a"), make_user("b")
        Notification.objects.bulk_create(
            [Notification(user=a, kind="accounts.created", text=f"n{i}") for i in range(3)] + [Notification(user=b, kind="accounts.created", text="x")]
        )
        c = client_for(a)
        assert c.get("/api/notifications/unread-count/").json() == {"unread": 3}
        first = c.get("/api/notifications/").json()["results"][0]
        c.post(f"/api/notifications/{first['id']}/read/")
        assert c.get("/api/notifications/?unread=true").json()["count"] == 2
        other = Notification.objects.get(user=b)
        c.post(f"/api/notifications/{other.id}/read/")
        assert Notification.objects.get(pk=other.pk).read_at is None
        assert c.post("/api/notifications/read-all/").json() == {"unread": 0}

    def test_failed_job_alerts_admins(self, admin, make_user, django_capture_on_commit_callbacks):
        keeper = make_user("keeper", permissions=["jobs.manage"])
        make_user("clerk")
        job = jobs.enqueue("tests.flaky", fail=True)
        with django_capture_on_commit_callbacks(execute=True):
            jobs.run_next()
            jobs.run_next(timezone.now() + timedelta(minutes=5))
        job.refresh_from_db()
        assert job.status == "failed"
        assert sorted(Notification.objects.filter(kind="jobs.failed").values_list("user__username", flat=True)) == ["admin", "keeper"]
        assert "«کار آزمایشی ناپایدار» پس از ۲ تلاش" in Notification.objects.filter(user=keeper).get().text


@pytest.mark.django_db
class TestTemplates:
    def test_edit_validate_reset_and_audit(self, api, make_user, client_for):
        kinds = {k["code"]: k for k in api.get("/api/notifications/kinds/").json()}
        assert kinds["accounts.created"]["preview"].startswith("خانم زهرا موسوی،")
        url = "/api/notifications/kinds/accounts.created/"
        r = api.patch(url, {"template": "خوش آمدید {name} {age}"}, format="json")
        assert r.json()["fields"]["template"] == "جای‌گذار {age} برای این اعلان تعریف نشده است."
        assert "آکولاد" in api.patch(url, {"template": "خوش آمدید {name"}, format="json").json()["fields"]["template"]
        r = api.patch(url, {"template": "{name} عزیز، خوش آمدید."}, format="json").json()
        assert r["is_custom"] and r["preview"] == "خانم زهرا موسوی عزیز، خوش آمدید."
        assert AuditLog.objects.get(action="update", model="notifications.notificationtemplate").object_repr == "ایجاد حساب کاربری"
        r = api.patch(url, {"template": kinds["accounts.created"]["default_template"]}, format="json").json()
        assert not r["is_custom"]
        assert client_for(make_user("clerk")).get("/api/notifications/kinds/").status_code == 403
