from django.core.management import call_command
from rest_framework.test import APITestCase


class NikyarTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", verbosity=0)

    def login(self, username):
        from django.core.cache import cache
        cache.clear()  # محدودیت تعداد ورود در آزمون‌ها مزاحم نشود
        self.client.credentials()
        r = self.client.post("/api/auth/login/", {"username": username, "password": "nikyar123"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {r.data['token']}")
        return r.data["user"]

    def ok(self, r, code=200):
        self.assertEqual(r.status_code, code, getattr(r, "data", r))
        return r.data

    def bad(self, r, code=400):
        self.assertEqual(r.status_code, code, getattr(r, "data", r))
        return r.data
