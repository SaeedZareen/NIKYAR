import pytest
from django.conf import settings


def test_health(client):
    r = client.get("/api/health/")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["version"] == settings.VERSION


def test_openapi_schema(client):
    r = client.get("/api/schema/")
    assert r.status_code == 200
    assert b"NIKYAR API" in r.content


def test_unknown_api_path_is_not_spa(client):
    assert client.get("/api/does-not-exist/").status_code == 404


@pytest.mark.parametrize("path", ["/", "/ui-kit/data-table", "/ui-kit/data-table/12?q=x"])
def test_spa_fallback(client, path, tmp_path, monkeypatch):
    (tmp_path / "index.html").write_text("<html>nikyar</html>", encoding="utf-8")
    monkeypatch.setattr(settings, "FRONTEND_DIST", tmp_path)
    r = client.get(path)
    assert r.status_code == 200
    assert b"nikyar" in b"".join(r.streaming_content)
