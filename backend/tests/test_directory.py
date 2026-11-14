"""ورود با Active Directory (6.7) روی سرور LDAP ساختگی ldap3 (MOCK_SYNC): یافتن، گروه مجاز، ساخت و هم‌سان‌سازی کاربر."""

import pytest
from ldap3 import MOCK_SYNC, OFFLINE_AD_2012_R2, Server
from rest_framework.test import APIClient

from core.accounts import directory
from core.accounts.models import User
from core.kernel.secrets import encrypt
from core.settings.models import SettingsValue

BASE = "DC=example,DC=local"
STAFF = f"CN=NIKYAR Users,OU=Groups,{BASE}"


@pytest.fixture
def ad(monkeypatch):
    """دامنه‌ی ساختگی با حساب جست‌وجو، دو کارمند (یکی در گروه مجاز) و تنظیمات روشن."""
    fake = Server("dc1.example.local", get_info=OFFLINE_AD_2012_R2)
    monkeypatch.setattr(directory, "server", lambda cfg: fake)
    monkeypatch.setattr(directory, "STRATEGY", MOCK_SYNC)
    seed = directory.Connection(fake, user=f"CN=svc,{BASE}", password="svc-pass", client_strategy=MOCK_SYNC)
    seed.strategy.add_entry(f"CN=svc,{BASE}", {"objectClass": "user", "sAMAccountName": "svc", "userPassword": "svc-pass"})
    seed.strategy.add_entry(
        f"CN=Ali Rezaei,OU=Staff,{BASE}",
        {
            "objectClass": "user",
            "sAMAccountName": "ali.r",
            "userPassword": "Win-Pass-1",
            "givenName": "علی",
            "sn": "رضایی",
            "mail": "ali@example.ir",
            "mobile": "+989121112233",
            "memberOf": [STAFF],
        },
    )
    seed.strategy.add_entry(
        f"CN=Guest,OU=Staff,{BASE}", {"objectClass": "user", "sAMAccountName": "guest", "userPassword": "Guest-Pass-1", "givenName": "مهمان"}
    )
    values = {
        "enabled": True,
        "server_url": "ldap://dc1.example.local",
        "bind_user": f"CN=svc,{BASE}",
        "bind_password": encrypt("svc-pass"),
        "base_dn": BASE,
    }
    SettingsValue.objects.update_or_create(section="directory", defaults={"values": values})
    return values


def login(username, password):
    c = APIClient()
    c.get("/api/auth/session/")
    return c, c.post("/api/auth/session/", {"username": username, "password": password}, format="json", HTTP_X_CSRFTOKEN=c.cookies["csrftoken"].value)


@pytest.mark.django_db
class TestLogin:
    def test_first_login_creates_and_syncs_the_user(self, ad):
        c, r = login("ali.r", "Win-Pass-1")
        assert r.status_code == 200, r.json()
        user = User.objects.get(username="ali.r")
        assert (user.first_name, user.last_name, user.email, user.mobile) == ("علی", "رضایی", "ali@example.ir", "09121112233")
        assert user.auth_source == "ldap" and not user.has_usable_password()
        assert r.json()["auth_source"] == "ldap" and not r.json()["must_change_password"]
        # گذرواژه‌ی نادرست ویندوز
        assert login("ali.r", "wrong")[1].json()["detail"] == "نام کاربری یا گذرواژه درست نیست."

    def test_allowed_groups(self, ad):
        SettingsValue.objects.filter(section="directory").update(values={**ad, "allowed_groups": [STAFF]})
        assert login("ali.r", "Win-Pass-1")[1].status_code == 200
        r = login("guest", "Guest-Pass-1")[1]
        assert r.status_code == 400 and "گروه‌های مجاز" in r.json()["detail"]
        assert not User.objects.filter(username="guest").exists()

    def test_without_auto_create_and_local_users_untouched(self, ad, make_user):
        SettingsValue.objects.filter(section="directory").update(values={**ad, "auto_create": False})
        assert "هنوز در نیک‌یار ساخته نشده" in login("ali.r", "Win-Pass-1")[1].json()["detail"]
        # کاربر محلی هم‌نام: فقط گذرواژه‌ی نیک‌یار
        make_user("guest")
        assert login("guest", "Guest-Pass-1")[1].status_code == 400
        assert login("guest", "Pass-1234!")[1].status_code == 200

    def test_password_is_managed_in_ad(self, ad, api):
        login("ali.r", "Win-Pass-1")
        user = User.objects.get(username="ali.r")
        r = api.patch(f"/api/auth/users/{user.pk}/", {"password": "Other-Pass-9"}, format="json")
        assert r.status_code == 400 and "Active Directory" in r.json()["fields"]["password"]
        assert api.get(f"/api/auth/users/{user.pk}/").json()["auth_source"] == "ldap"

    def test_server_down_message(self, ad, monkeypatch):
        def broken(cfg):
            raise directory.DirectoryError("اتصال به سرور Active Directory برقرار نشد.")

        monkeypatch.setattr(directory, "service_connection", broken)
        assert login("ali.r", "Win-Pass-1")[1].json()["detail"] == "اتصال به سرور Active Directory برقرار نشد."


@pytest.mark.django_db
class TestSettingsAndTest:
    def test_validation(self, api):
        r = api.put("/api/settings/directory/", {"enabled": True, "server_url": "dc1", "user_filter": "sAMAccountName"}, format="json")
        fields = r.json()["fields"]
        assert "ldap://" in fields["server_url"] and "{username}" in fields["user_filter"]
        r = api.put("/api/settings/directory/", {"enabled": True, "server_url": "ldaps://dc1:636"}, format="json")
        assert set(r.json()["fields"]) == {"bind_user", "bind_password", "base_dn"}

    def test_connection_test(self, ad, api):
        assert api.post("/api/auth/directory/test/", {}, format="json").json() == {"ok": True, "message": "اتصال و حساب جست‌وجو درست است."}
        assert "پیدا شد و در گروه‌های مجاز است" in api.post("/api/auth/directory/test/", {"username": "ali.r"}, format="json").json()["message"]
        assert "پیدا نشد" in api.post("/api/auth/directory/test/", {"username": "nobody"}, format="json").json()["message"]
        SettingsValue.objects.filter(section="directory").update(values={**ad, "bind_password": encrypt("bad")})
        assert api.post("/api/auth/directory/test/", {}, format="json").json() == {
            "ok": False,
            "message": "سرور Active Directory حساب جست‌وجو یا گذرواژه‌اش را نپذیرفت.",
        }
