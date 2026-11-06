import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from core.accounts.models import Role, User


@pytest.fixture(scope="session")
def django_db_modify_db_settings(tmp_path_factory):
    # پایگاه آزمون روی فایل (مثل نصب واقعی، با WAL و قفل نوشتن)، نه حافظه‌ی مشترک؛ تا آزمون هم‌زمانی واقعی باشد.
    from django.conf import settings

    db = settings.DATABASES["default"]
    if db["ENGINE"].endswith("sqlite3"):
        db["TEST"] = {**db.get("TEST", {}), "NAME": str(tmp_path_factory.mktemp("db") / "test.sqlite3")}


@pytest.fixture(autouse=True)
def _fast_tests(settings, tmp_path):
    # درهم‌سازی سریع گذرواژه فقط در آزمون‌ها؛ و پاک‌کردن شمارنده‌ی محدودیت تلاش ورود.
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
    cache.clear()
    # فایل‌های بارگذاری‌شده‌ی آزمون در پوشه‌ی موقت
    settings.MEDIA_ROOT = tmp_path / "media"


@pytest.fixture
def make_user(db):
    def make(username="user", permissions=(), superuser=False, **extra):
        user = User(username=username, first_name=extra.pop("first_name", "کاربر"), last_name=extra.pop("last_name", username), is_superuser=superuser, **extra)
        user.set_password("Pass-1234!")
        user.save()
        if permissions:
            role = Role.objects.create(name=f"role-{username}", permissions=list(permissions))
            user.roles.add(role)
        return user

    return make


@pytest.fixture
def client_for():
    def make(user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    return make


@pytest.fixture
def admin(make_user):
    return make_user("admin", superuser=True)


@pytest.fixture
def api(client_for, admin):
    return client_for(admin)
