"""تأیید با یک کلیک از ایمیل (4.6b): پیوند یک‌بارمصرف و زمان‌دار برای تصمیم‌های بی یادداشت الزامی."""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from core.workflow import quick, service
from core.workflow.models import Event, QuickAction, Request, Task
from tests.test_workflow_routing import form, linear, open_task, org, publish  # noqa: F401

DECISIONS = [{"value": "approve", "label": "تأیید"}, {"value": "reject", "label": "رد", "comment": "required"}]
URL = "/api/workflow/quick/"


@pytest.fixture
def site(monkeypatch):
    monkeypatch.setattr(quick, "messaging_config", lambda: {"site_url": "http://nikyar.local:8000/"})


@pytest.fixture
def task(org, form, admin):  # noqa: F811
    process = publish(form, linear(("t1", "بررسی حسابدار", {"type": "user", "user": org["clerk"].pk}, {"decisions": DECISIONS})), admin)
    return open_task(service.start(process, org["ceo"], {"subject": "میز"}), "t1")


def token_of(text: str) -> str:
    return text.split("/quick/")[1].split()[0]


def test_links_only_for_decisions_without_required_comment(task, org, site):  # noqa: F811
    text = quick.email_links(task, DECISIONS)(org["clerk"])
    assert text.count("/quick/") == 1 and "تأیید: http://nikyar.local:8000/quick/" in text
    assert QuickAction.objects.get().decision == "approve"


def test_no_site_url_no_links(task, org, monkeypatch):  # noqa: F811
    monkeypatch.setattr(quick, "messaging_config", lambda: {"site_url": ""})
    assert quick.email_links(task, DECISIONS)(org["clerk"]) == "" and not QuickAction.objects.exists()


def test_confirm_page_then_use_once(task, org, site):  # noqa: F811
    token = token_of(quick.email_links(task, DECISIONS)(org["clerk"]))
    anonymous = APIClient()
    info = anonymous.get(f"{URL}{token}/").json()
    assert info["status"] == "ready" and info["decision_label"] == "تأیید" and info["step"] == "بررسی حسابدار"
    done = anonymous.post(f"{URL}{token}/").json()
    assert done["status"] == "used"
    task.refresh_from_db()
    assert task.status == Task.Status.DONE and task.acted_by == org["clerk"] and task.comment == quick.COMMENT
    assert task.request.events.filter(kind=Event.Kind.TASK, actor=org["clerk"]).exists()
    task.request.refresh_from_db()
    assert task.request.status == Request.Status.COMPLETED
    again = anonymous.post(f"{URL}{token}/")
    assert again.status_code == 400 and "پیش‌تر استفاده شده" in again.json()["detail"]


def test_expired_closed_and_invalid(task, org, site):  # noqa: F811
    first = token_of(quick.email_links(task, DECISIONS)(org["clerk"]))
    QuickAction.objects.filter(token=first).update(expires_at=timezone.now() - timedelta(minutes=1))
    assert APIClient().get(f"{URL}{first}/").json()["status"] == "expired"
    assert APIClient().post(f"{URL}{first}/").status_code == 400
    second = token_of(quick.email_links(task, DECISIONS)(org["clerk"]))
    service.complete(task, org["clerk"], "approve")
    assert APIClient().get(f"{URL}{second}/").json()["status"] == "closed"
    assert APIClient().get(f"{URL}nope/").json()["status"] == "invalid"


def test_link_of_someone_no_longer_assigned(task, org, site):  # noqa: F811
    token = token_of(quick.email_links(task, DECISIONS)(org["clerk"]))
    task.candidates.set([org["auditor"]])
    r = APIClient().post(f"{URL}{token}/")
    assert r.status_code == 400 and "دیگر به شما سپرده نیست" in r.json()["detail"]
