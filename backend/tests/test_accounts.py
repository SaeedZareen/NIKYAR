import pytest
from rest_framework.test import APIClient

from core.audit.models import AuditLog
from core.accounts.models import Role, User


@pytest.mark.django_db
class TestSession:
    def test_login_logout_and_me_with_csrf(self, make_user):
        make_user("reza", permissions=["org.view"], first_name="رضا", last_name="احمدی", gender="male")
        c = APIClient(enforce_csrf_checks=True)
        r = c.get("/api/auth/session/")
        assert r.status_code == 403 and r.json()["detail"] == "ابتدا وارد سامانه شوید."
        token = r.cookies["csrftoken"].value

        assert c.post("/api/auth/session/", {"username": "reza", "password": "Pass-1234!"}, format="json").status_code == 403  # بدون توکن CSRF
        r = c.post("/api/auth/session/", {"username": "reza", "password": "Pass-1234!"}, format="json", HTTP_X_CSRFTOKEN=token)
        assert r.status_code == 200
        me = r.json()
        assert me["title"] == "آقای رضا احمدی" and me["permissions"] == ["org.view"]

        token = c.cookies["csrftoken"].value  # Django پس از ورود توکن را عوض می‌کند
        assert c.delete("/api/auth/session/", HTTP_X_CSRFTOKEN=token).status_code == 204
        assert c.get("/api/auth/session/").status_code == 403
        assert list(AuditLog.objects.values_list("action", flat=True)) == ["logout", "login"]

    def test_wrong_password_is_persian_and_audited(self, make_user):
        make_user("reza")
        r = APIClient().post("/api/auth/session/", {"username": "reza", "password": "bad"}, format="json")
        assert r.status_code == 400 and r.json()["detail"] == "نام کاربری یا گذرواژه درست نیست."
        assert AuditLog.objects.get().action == "login_failed"

    def test_login_is_throttled(self, make_user):
        c = APIClient()
        codes = [c.post("/api/auth/session/", {"username": "x", "password": "y"}, format="json").status_code for _ in range(11)]
        assert codes[-1] == 429

    def test_change_password(self, make_user, client_for):
        user = make_user("reza")
        c = client_for(user)
        r = c.post("/api/auth/session/password/", {"current_password": "wrong", "new_password": "N3w-Secret-99"}, format="json")
        assert r.status_code == 400 and r.json()["fields"]["current_password"] == "گذرواژه‌ی فعلی درست نیست."
        r = c.post("/api/auth/session/password/", {"current_password": "Pass-1234!", "new_password": "N3w-Secret-99"}, format="json")
        assert r.status_code == 204
        user.refresh_from_db()
        assert user.check_password("N3w-Secret-99")


@pytest.mark.django_db
class TestUsers:
    def test_permissions_are_enforced(self, make_user, client_for):
        viewer = client_for(make_user("viewer", permissions=["accounts.users.view"]))
        assert viewer.get("/api/auth/users/").status_code == 200
        r = viewer.post("/api/auth/users/", {"username": "x"}, format="json")
        assert r.status_code == 403 and r.json()["detail"] == "برای این کار مجوز ندارید."
        assert client_for(make_user("nobody")).get("/api/auth/users/").status_code == 403

    def test_create_validates_in_persian_and_audits(self, api):
        r = api.post("/api/auth/users/", {"username": "ali", "first_name": "علی", "last_name": "", "mobile": "0912"}, format="json")
        assert r.status_code == 400
        fields = r.json()["fields"]
        assert fields["mobile"] == "شماره‌ی موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود."
        assert "last_name" in fields and "password" in fields

        role = Role.objects.create(name="ناظر", permissions=["org.view"])
        r = api.post(
            "/api/auth/users/",
            {"username": "ali", "first_name": "علی", "last_name": "رضایی", "mobile": "۰۹۱۲۱۲۳۴۵۶۷", "password": "Strong-Pass-1", "roles": [role.id]},
            format="json",
        )
        assert r.status_code == 201, r.json()
        assert r.json()["mobile"] == "09121234567" and r.json()["role_names"] == ["ناظر"]
        log = AuditLog.objects.get(action="create")
        assert log.object_repr == "علی رضایی" and "password" not in log.changes and log.changes["roles"]["new"] == "ناظر"

    def test_only_superuser_can_grant_superuser(self, make_user, client_for):
        manager = client_for(make_user("mgr", permissions=["accounts.users.manage"]))
        r = manager.post("/api/auth/users/", {"username": "boss", "first_name": "ب", "last_name": "ب", "password": "Strong-Pass-1", "is_superuser": True}, format="json")
        assert r.status_code == 400 and "is_superuser" in r.json()["fields"]

    def test_cannot_deactivate_self(self, api, admin):
        r = api.patch(f"/api/auth/users/{admin.id}/", {"is_active": False}, format="json")
        assert r.status_code == 400 and User.objects.get(pk=admin.pk).is_active

    def test_filters_search_and_pagination(self, api, make_user):
        for i in range(30):
            make_user(f"u{i:02}", is_active=i % 3 != 0)
        r = api.get("/api/auth/users/?is_active=false&page_size=10")
        assert r.json()["count"] == 10 and len(r.json()["results"]) == 10
        assert api.get("/api/auth/users/?search=u05").json()["count"] == 1


@pytest.mark.django_db
class TestRoles:
    def test_unknown_permission_rejected_and_catalog(self, api):
        r = api.post("/api/auth/roles/", {"name": "x", "permissions": ["no.such"]}, format="json")
        assert r.status_code == 400 and "مجوز ناشناخته" in r.json()["fields"]["permissions"]
        catalog = api.get("/api/auth/permissions/").json()
        codes = {p["code"] for g in catalog for p in g["permissions"]}
        assert {"accounts.users.manage", "org.manage", "audit.view", "lookups.manage"} <= codes

    def test_role_in_use_cannot_be_deleted(self, api, make_user):
        user = make_user("u", permissions=["org.view"])
        role = user.roles.get()
        r = api.delete(f"/api/auth/roles/{role.id}/")
        assert r.status_code == 400 and "به کاربرانی داده شده" in r.json()["detail"]
