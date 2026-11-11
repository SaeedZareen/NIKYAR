import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from core.accounts.models import Role
from core.audit.models import AuditLog
from core.files.models import StoredFile
from core.forms.models import FormVersion, Submission

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PDF = b"%PDF-1.7\n" + b"x" * 64

DEFINITION = {
    "sections": [
        {
            "id": "main",
            "title": "درخواست",
            "columns": 2,
            "fields": [
                {"id": "title", "type": "text", "label": "عنوان", "required": True},
                {"id": "amount", "type": "amount", "label": "مبلغ", "required": True},
                {"id": "docs", "type": "attachment", "label": "پیش‌فاکتور", "props": {"multiple": True, "max_files": 2, "extensions": ["pdf"]}},
                {"id": "sign", "type": "signature", "label": "امضا"},
            ],
        }
    ]
}


def upload(client, name, content):
    return client.post("/api/files/", {"file": SimpleUploadedFile(name, content)}, format="multipart").json()["id"]


@pytest.fixture
def designer(make_user, client_for):
    return client_for(make_user("designer", permissions=["forms.design"]))


@pytest.fixture
def published(designer):
    """فرم منتشرشده‌ای که همه پر می‌کنند."""
    form = designer.post("/api/forms/", {"code": "purchase", "title": "درخواست خرید", "fill_by_everyone": True}, format="json").json()
    draft = form["draft_version"]
    assert designer.patch(f"/api/forms/versions/{draft}/", {"definition": DEFINITION}, format="json").status_code == 200
    assert designer.post(f"/api/forms/versions/{draft}/publish/").status_code == 200
    return form


@pytest.mark.django_db(transaction=True)
class TestDesign:
    def test_create_edit_publish_and_new_draft(self, designer, make_user, client_for):
        r = designer.post("/api/forms/", {"code": "leave", "title": "مرخصی"}, format="json")
        assert r.status_code == 201, r.json()
        form = r.json()
        assert form["published_version"] is None and form["draft_version"] and form["submission_count"] == 0
        draft = form["draft_version"]
        v = designer.get(f"/api/forms/versions/{draft}/").json()
        assert v["number"] == 1 and v["status"] == "draft" and v["definition"] == {"sections": []}

        # تعریف نادرست با پیام فارسی برای هر مسیر
        bad = {"sections": [{"id": "s", "fields": [{"id": "x", "type": "rocket", "label": "؟"}]}]}
        r = designer.patch(f"/api/forms/versions/{draft}/", {"definition": bad}, format="json")
        assert r.status_code == 400 and "rocket" in r.json()["fields"]["sections.0.fields.0.type"]
        # فرم بدون فیلد منتشر نمی‌شود
        assert "دست‌کم یک فیلد" in designer.post(f"/api/forms/versions/{draft}/publish/").json()["detail"]

        r = designer.patch(f"/api/forms/versions/{draft}/", {"definition": DEFINITION}, format="json").json()
        assert r["field_count"] == 4 and r["schema"]["required"] == ["title", "amount"] and r["schema"]["title"] == "مرخصی"
        assert designer.post(f"/api/forms/versions/{draft}/publish/").json()["status"] == "published"
        assert designer.post(f"/api/forms/versions/{draft}/publish/").status_code == 400
        assert "تغییر نمی‌کند" in designer.patch(f"/api/forms/versions/{draft}/", {"definition": DEFINITION}, format="json").json()["detail"]

        r = designer.post(f"/api/forms/{form['id']}/new-draft/")
        assert r.status_code == 201 and r.json()["number"] == 2 and r.json()["definition"] == DEFINITION
        assert "پیش‌نویس باز" in designer.post(f"/api/forms/{form['id']}/new-draft/").json()["detail"]
        f = designer.get(f"/api/forms/{form['id']}/").json()
        assert f["published_version"] == 1 and f["draft_version"] == r.json()["id"]
        assert [x["number"] for x in designer.get(f"/api/forms/versions/?form={form['id']}").json()] == [2, 1]

        # شناسه ثابت است و یکتا
        assert "تغییر نمی‌کند" in designer.patch(f"/api/forms/{form['id']}/", {"code": "other"}, format="json").json()["fields"]["code"]
        assert "استفاده شده" in designer.post("/api/forms/", {"code": "leave", "title": "x"}, format="json").json()["fields"]["code"]
        assert "حرف کوچک لاتین" in designer.post("/api/forms/", {"code": "Leave!", "title": "x"}, format="json").json()["fields"]["code"]

        # سوابق: ساخت فرم، انتشار و پیش‌نویس تازه؛ ذخیره‌های پیش‌نویس نه
        actions = list(AuditLog.objects.filter(model__startswith="forms.").values_list("model", "action"))
        assert ("forms.form", "create") in actions and ("forms.formversion", "update") in actions and ("forms.formversion", "create") in actions
        assert len(actions) == 3

        # کاربر عادی به طراحی دسترسی ندارد
        other = client_for(make_user("plain"))
        assert other.get("/api/forms/").status_code == 403 and other.get(f"/api/forms/versions/{draft}/").status_code == 403

    def test_category_and_delete_rules(self, designer, published):
        from core.lookups.models import LookupItem

        finance = LookupItem.objects.get(list__code="form-category", code="finance")
        gender = LookupItem.objects.get(list__code="gender", code="male")
        r = designer.patch(f"/api/forms/{published['id']}/", {"category": finance.pk}, format="json").json()
        assert r["category_title"] == "مالی"
        assert designer.patch(f"/api/forms/{published['id']}/", {"category": gender.pk}, format="json").status_code == 400
        temp = designer.post("/api/forms/", {"code": "temp", "title": "موقت"}, format="json").json()
        assert designer.delete(f"/api/forms/{temp['id']}/").status_code == 204


@pytest.mark.django_db(transaction=True)
class TestSubmissions:
    def test_draft_submit_files_and_signature(self, published, make_user, client_for):
        user = make_user("filler")
        c = client_for(user)
        avail = c.get("/api/forms/available/").json()
        assert [f["code"] for f in avail] == ["purchase"]
        ctx = c.get(f"/api/forms/{published['id']}/fill/").json()
        assert ctx["title"] == "درخواست خرید" and ctx["version_number"] == 1 and ctx["definition"] == DEFINITION
        assert ctx["schema"]["required"] == ["title", "amount"] and "required" not in ctx["draft_schema"]
        assert ctx["schema"]["properties"]["amount"]["x-messages"]["required"] == "تکمیل «مبلغ» الزامی است."

        mine = upload(c, "quote.pdf", PDF)
        image = upload(c, "photo.png", PNG)
        # پیش‌نویس: الزامی‌ها لازم نیست، ولی نوع مقدار سنجیده می‌شود
        r = c.post("/api/forms/submissions/", {"form": published["id"], "data": {"amount": "زیاد"}}, format="json")
        assert r.status_code == 400 and "ریال" in r.json()["fields"]["amount"]
        r = c.post("/api/forms/submissions/", {"form": published["id"], "data": {"title": "کاغذ", "docs": [mine]}}, format="json")
        assert r.status_code == 201, r.json()
        sub = r.json()
        assert sub["status"] == "draft" and sub["version_number"] == 1 and StoredFile.objects.get(pk=mine).claimed
        assert c.get(f"/api/forms/submissions/{sub['id']}/").json()["context"]["definition"] == DEFINITION
        assert not AuditLog.objects.filter(model="forms.submission").exists()

        # نوع فایل نامجاز، و فایل کاربر دیگر پذیرفته نمی‌شود
        r = c.patch(f"/api/forms/submissions/{sub['id']}/", {"data": {"docs": [mine, image]}}, format="json")
        assert "مجاز نیست" in r.json()["fields"]["docs"]
        stranger = client_for(make_user("stranger"))
        theirs = upload(stranger, "x.pdf", PDF)
        r = c.patch(f"/api/forms/submissions/{sub['id']}/", {"data": {"docs": [mine, theirs]}}, format="json")
        assert "پیدا نشد" in r.json()["fields"]["docs"]

        # ثبت نهایی: الزامی‌ها، جایگزینی فایل و رونوشت امضا
        r = c.patch(f"/api/forms/submissions/{sub['id']}/", {"data": {"title": "کاغذ"}, "submit": True}, format="json")
        assert r.json()["fields"] == {"amount": "تکمیل «مبلغ» الزامی است."}
        second = upload(c, "quote2.pdf", PDF)
        sig = upload(c, "sign.png", PNG)
        c.patch("/api/auth/session/profile/", {"signature": sig}, format="json")
        r = c.patch(
            f"/api/forms/submissions/{sub['id']}/",
            {"data": {"title": "کاغذ", "amount": 2_500_000, "docs": [second], "sign": "hack"}, "submit": True},
            format="json",
        )
        assert r.status_code == 200, r.json()
        done = r.json()
        assert done["status"] == "submitted" and done["submitted_at"] and done["data"]["docs"] == [second]
        assert not StoredFile.objects.filter(pk=mine).exists() and StoredFile.objects.get(pk=second).claimed
        copy = StoredFile.objects.get(pk=done["data"]["sign"])
        assert copy.claimed and str(copy.pk) != sig and copy.file.read() == PNG
        assert AuditLog.objects.filter(model="forms.submission", action="create").count() == 1

        # ثبت نهایی تغییر و حذف نمی‌شود
        assert "تغییر نمی‌کند" in c.patch(f"/api/forms/submissions/{sub['id']}/", {"data": {}}, format="json").json()["detail"]
        assert c.delete(f"/api/forms/submissions/{sub['id']}/").status_code == 400

    def test_required_signature_without_profile_signature(self, designer, make_user, client_for):
        form = designer.post("/api/forms/", {"code": "sig", "title": "تعهدنامه", "fill_by_everyone": True}, format="json").json()
        definition = {
            "sections": [
                {
                    "id": "s",
                    "fields": [{"id": "ok", "type": "boolean", "label": "متعهدم"}, {"id": "sign", "type": "signature", "label": "امضا", "required": True}],
                }
            ]
        }
        designer.patch(f"/api/forms/versions/{form['draft_version']}/", {"definition": definition}, format="json")
        designer.post(f"/api/forms/versions/{form['draft_version']}/publish/")
        c = client_for(make_user("nosig"))
        r = c.post("/api/forms/submissions/", {"form": form["id"], "data": {"ok": True}, "submit": True}, format="json")
        assert r.status_code == 400 and "حساب من" in r.json()["fields"]["sign"]

    def test_draft_delete_releases_files(self, published, make_user, client_for):
        c = client_for(make_user("u"))
        f = upload(c, "a.pdf", PDF)
        sub = c.post("/api/forms/submissions/", {"form": published["id"], "data": {"docs": [f]}}, format="json").json()
        assert c.delete(f"/api/forms/submissions/{sub['id']}/").status_code == 204
        assert not StoredFile.objects.filter(pk=f).exists()

    def test_visibility_and_fill_permissions(self, designer, published, make_user, client_for):
        role = Role.objects.create(name="کارپردازی")
        viewer_role = Role.objects.create(name="مالی")
        filler, viewer, outsider = make_user("filler"), make_user("viewer"), make_user("outsider")
        filler.roles.add(role)
        viewer.roles.add(viewer_role)
        designer.patch(f"/api/forms/{published['id']}/", {"fill_by_everyone": False, "fill_roles": [role.pk], "view_roles": [viewer_role.pk]}, format="json")

        fc, vc, oc = client_for(filler), client_for(viewer), client_for(outsider)
        assert oc.get("/api/forms/available/").json() == []
        assert oc.get(f"/api/forms/{published['id']}/fill/").status_code == 403
        assert oc.post("/api/forms/submissions/", {"form": published["id"], "data": {}}, format="json").status_code == 403

        draft = fc.post("/api/forms/submissions/", {"form": published["id"], "data": {"title": "پیش‌نویس"}}, format="json").json()
        done = fc.post("/api/forms/submissions/", {"form": published["id"], "data": {"title": "نهایی", "amount": 10}, "submit": True}, format="json").json()
        assert done["status"] == "submitted"

        def ids(client, query=""):
            return {s["id"] for s in client.get(f"/api/forms/submissions/{query}").json()["results"]}

        assert ids(fc) == {draft["id"], done["id"]}
        # بیننده و طراح فقط ثبت‌های نهایی دیگران را می‌بینند، نه پیش‌نویس‌ها
        assert ids(vc) == {done["id"]} and ids(designer) == {done["id"]} and ids(oc) == set()
        assert ids(vc, "?mine=true") == set() and ids(fc, "?status=draft") == {draft["id"]}
        assert vc.get(f"/api/forms/submissions/{draft['id']}/").status_code == 404
        assert vc.patch(f"/api/forms/submissions/{done['id']}/", {"data": {}}, format="json").status_code == 403

        # فرم غیرفعال: دیگر در فهرست نیست و پیش‌نویس ثبت نهایی نمی‌شود
        designer.patch(f"/api/forms/{published['id']}/", {"is_active": False}, format="json")
        assert fc.get("/api/forms/available/").json() == []
        r = fc.patch(f"/api/forms/submissions/{draft['id']}/", {"data": {"title": "x", "amount": 1}, "submit": True}, format="json")
        assert "دیگر برای شما" in r.json()["detail"]
        # فرم دارای ثبت حذف نمی‌شود
        assert "غیرفعال کنید" in designer.delete(f"/api/forms/{published['id']}/").json()["detail"]

    def test_submission_keeps_its_version(self, designer, published, make_user, client_for):
        c = client_for(make_user("u"))
        draft = c.post("/api/forms/submissions/", {"form": published["id"], "data": {"title": "قدیمی"}}, format="json").json()
        v2 = designer.post(f"/api/forms/{published['id']}/new-draft/").json()
        new_def = {"sections": [{"id": "s", "fields": [{"id": "reason", "type": "textarea", "label": "علت", "required": True}]}]}
        designer.patch(f"/api/forms/versions/{v2['id']}/", {"definition": new_def}, format="json")
        designer.post(f"/api/forms/versions/{v2['id']}/publish/")
        # پیش‌نویس قبلی با نسخه‌ی ۱ ثبت می‌شود؛ ثبت تازه با نسخه‌ی ۲
        old = c.patch(f"/api/forms/submissions/{draft['id']}/", {"data": {"title": "قدیمی", "amount": 5}, "submit": True}, format="json").json()
        assert old["version_number"] == 1
        new = c.post("/api/forms/submissions/", {"form": published["id"], "data": {"reason": "تست"}, "submit": True}, format="json").json()
        assert new["version_number"] == 2 and Submission.objects.get(pk=new["id"]).version.status == FormVersion.Status.PUBLISHED


@pytest.mark.django_db(transaction=True)
class TestSystemDataFields:
    """3.3b: داده‌های سامانه با محدودیت، استان و شهر، مشخصات ثبت‌کننده و امضای دستی."""

    def _publish(self, designer, code, fields):
        form = designer.post("/api/forms/", {"code": code, "title": code, "fill_by_everyone": True}, format="json").json()
        r = designer.patch(f"/api/forms/versions/{form['draft_version']}/", {"definition": {"sections": [{"id": "s", "fields": fields}]}}, format="json")
        assert r.status_code == 200, r.json()
        designer.post(f"/api/forms/versions/{form['draft_version']}/publish/")
        return form["id"]

    def test_user_unit_role_filters_and_lookups(self, designer, make_user, client_for):
        from core.org.models import Assignment, OrgUnit, Position

        root = OrgUnit.objects.create(name="مدیریت")
        finance = OrgUnit.objects.create(name="مالی", parent=root)
        other = OrgUnit.objects.create(name="فروش")
        inside, outside = make_user("inside"), make_user("outside")
        role = Role.objects.create(name="کارپرداز")
        inside.roles.add(role)
        pos = Position.objects.create(title="حسابدار", unit=finance)
        Position.objects.create(title="فروشنده", unit=other)
        Assignment.objects.create(user=inside, position=pos, start_date="2020-01-01")

        bad = {"sections": [{"id": "s", "fields": [{"id": "u", "type": "user", "label": "کاربر", "props": {"unit": 9999}}]}]}
        form = designer.post("/api/forms/", {"code": "bad-unit", "title": "x"}, format="json").json()
        r = designer.patch(f"/api/forms/versions/{form['draft_version']}/", {"definition": bad}, format="json")
        assert "واحد سازمانی" in r.json()["fields"]["sections.0.fields.0.props.unit"]

        fid = self._publish(
            designer,
            "picker",
            [
                {"id": "buyer", "type": "user", "label": "کارپرداز", "props": {"unit": root.pk, "role": role.pk}},
                {"id": "pos", "type": "position", "label": "سمت", "props": {"unit": root.pk}},
            ],
        )
        c = client_for(make_user("filler"))
        names = {u["username"] for u in c.get(f"/api/auth/user-lookup/?unit={root.pk}&role={role.pk}").json()}
        assert names == {"inside"}
        assert [u["full_name"] for u in c.get(f"/api/auth/user-lookup/?ids={outside.pk}").json()] == [outside.get_full_name()]
        assert [p["title"] for p in c.get(f"/api/org/position-lookup/?unit={root.pk}").json()] == ["حسابدار"]
        assert {u["name"] for u in c.get("/api/org/unit-lookup/").json()} == {"مدیریت", "مالی", "فروش"}

        r = c.post("/api/forms/submissions/", {"form": fid, "data": {"buyer": outside.pk}, "submit": True}, format="json")
        assert "پیدا نشد" in r.json()["fields"]["buyer"]
        other_pos = Position.objects.get(title="فروشنده")
        r = c.post("/api/forms/submissions/", {"form": fid, "data": {"buyer": inside.pk, "pos": other_pos.pk}, "submit": True}, format="json")
        assert "پیدا نشد" in r.json()["fields"]["pos"]
        r = c.post("/api/forms/submissions/", {"form": fid, "data": {"buyer": inside.pk, "pos": pos.pk}, "submit": True}, format="json")
        assert r.status_code == 201

    def test_region_submitter_and_signature_pad(self, designer, make_user, client_for):
        from core.org.models import Assignment, OrgUnit, Position

        fid = self._publish(
            designer,
            "region",
            [
                {"id": "where", "type": "region", "label": "محل", "required": True},
                {"id": "county", "type": "region", "label": "شهرستان", "props": {"level": "county"}},
                {"id": "me", "type": "submitter", "label": "درخواست‌کننده", "props": {"items": ["name", "unit", "position", "mobile"]}},
                {"id": "sign", "type": "signature_pad", "label": "امضای تحویل‌گیرنده", "required": True},
            ],
        )
        user = make_user("sub", first_name="سارا", last_name="محمدی", mobile="09121112233")
        unit = OrgUnit.objects.create(name="منابع انسانی")
        Assignment.objects.create(user=user, position=Position.objects.create(title="کارشناس", unit=unit), start_date="2020-01-01")
        c = client_for(user)
        assert c.get("/api/auth/session/").json()["assignment"]["unit"] == "منابع انسانی"
        regions = c.get("/api/forms/regions/").json()
        tehran = next(p for p in regions if p["name"] == "تهران")
        assert len(regions) == 31 and "شمیرانات" in tehran["counties"] and "تجریش" in tehran["cities"]

        pdf = upload(c, "x.pdf", PDF)
        r = c.post(
            "/api/forms/submissions/",
            {
                "form": fid,
                "data": {"where": {"province": "تهران", "city": "تبریز"}, "county": {"province": "تهران", "city": "تجریش"}, "sign": pdf},
                "submit": True,
            },
            format="json",
        )
        errs = r.json()["fields"]
        assert "از فهرست" in errs["where"] and "از فهرست" in errs["county"] and "دوباره امضا کنید" in errs["sign"]

        png = upload(c, "sign.png", PNG)
        data = {"where": {"province": "تهران", "city": "تجریش"}, "county": {"province": "تهران", "city": "شمیرانات"}, "sign": png, "me": {"name": "جعل"}}
        r = c.post("/api/forms/submissions/", {"form": fid, "data": data, "submit": True}, format="json")
        assert r.status_code == 201, r.json()
        saved = r.json()["data"]
        assert saved["me"] == {"name": "سارا محمدی", "unit": "منابع انسانی", "position": "کارشناس", "mobile": "09121112233"}
        assert StoredFile.objects.get(pk=png).claimed

    def test_file_info(self, make_user, client_for):
        c = client_for(make_user("files"))
        a, b = upload(c, "a.pdf", PDF), upload(c, "b.png", PNG)
        info = c.get(f"/api/files/info/?ids={b},{a},not-a-uuid").json()
        assert [f["name"] for f in info] == ["b.png", "a.pdf"]


@pytest.mark.django_db
def test_designer_catalogue_and_role_lookup(designer, make_user, client_for):
    types = {t["code"]: t for t in designer.get("/api/forms/field-types/").json()}
    assert types["text"]["title"] == "متن یک‌خطی" and types["text"]["column"] and not types["table"]["column"]
    script = next(p for p in types["text"]["props"] if p["name"] == "script")
    assert script["kind"] == "choice" and {"value": "persian", "label": "فقط فارسی"} in script["choices"]
    assert not types["submitter"]["client_value"] and not types["heading"]["has_value"]
    assert client_for(make_user("nobody")).get("/api/forms/field-types/").status_code == 403
    Role.objects.create(name="بازرسی")
    assert "بازرسی" in [r["name"] for r in client_for(make_user("anyone")).get("/api/auth/role-lookup/").json()]


def test_unique_value_across_submissions(designer, make_user, client_for):
    form = designer.post("/api/forms/", {"code": "uniq", "title": "یکتا", "fill_by_everyone": True}, format="json").json()
    fields = [{"id": "nid", "type": "national_code", "label": "کد ملی", "unique": True}, {"id": "note", "type": "text", "label": "یادداشت"}]
    r = designer.patch(f"/api/forms/versions/{form['draft_version']}/", {"definition": {"sections": [{"id": "s", "fields": fields}]}}, format="json")
    assert r.status_code == 200, r.json()
    designer.post(f"/api/forms/versions/{form['draft_version']}/publish/")
    a, b = client_for(make_user("uniq_a")), client_for(make_user("uniq_b"))
    post = lambda c, submit: c.post("/api/forms/submissions/", {"form": form["id"], "data": {"nid": "0084575948"}, "submit": submit}, format="json")  # noqa: E731
    assert post(a, True).status_code == 201
    # پیش‌نویس با مقدار تکراری ذخیره می‌شود ولی ثبت نهایی‌اش نه
    draft = post(b, False)
    assert draft.status_code == 201
    r = b.patch(f"/api/forms/submissions/{draft.json()['id']}/", {"data": {"nid": "0084575948"}, "submit": True}, format="json")
    assert r.status_code == 400 and "پیش‌تر در ثبت دیگری" in r.json()["fields"]["nid"]


@pytest.mark.django_db(transaction=True)
def test_definition_files_claim_and_release(designer):
    """تصویر و فایل راهنمای تعریف: تصاحب هنگام ذخیره، ماندن تا نسخه‌ای از آن استفاده می‌کند، حذف پس از آن."""
    form = designer.post("/api/forms/", {"code": "guide", "title": "راهنما", "fill_by_everyone": True}, format="json").json()
    img, guide = upload(designer, "chart.png", PNG), upload(designer, "contract.pdf", PDF)
    fields = [
        {"id": "img", "type": "image", "props": {"file": img}},
        {"id": "dl", "type": "download", "label": "نمونه‌ی قرارداد", "props": {"file": guide}},
        {"id": "p", "type": "paragraph", "props": {"content": "<p>متن <b>مهم</b><script>x</script></p>"}},
        {"id": "name", "type": "text", "label": "نام"},
    ]
    url = f"/api/forms/versions/{form['draft_version']}/"
    r = designer.patch(url, {"definition": {"sections": [{"id": "s", "fields": fields}]}}, format="json")
    assert r.status_code == 200, r.json()
    assert r.json()["definition"]["sections"][0]["fields"][2]["props"]["content"] == "<p>متن <b>مهم</b></p>"
    assert StoredFile.objects.get(pk=img).claimed and StoredFile.objects.get(pk=guide).claimed
    # نسخه‌ی منتشرشده و پیش‌نویس تازه همان فایل‌ها را دارند؛ برداشتن از پیش‌نویس فایل را حذف نمی‌کند
    designer.post(f"{url}publish/")
    draft = designer.post(f"/api/forms/{form['id']}/new-draft/").json()["id"]
    assert designer.patch(f"/api/forms/versions/{draft}/", {"definition": {"sections": [{"id": "s", "fields": fields[2:]}]}}, format="json").status_code == 200
    assert StoredFile.objects.filter(pk=img).exists()
    # با حذف فرم (همه‌ی نسخه‌ها) فایل‌ها هم حذف می‌شوند
    assert designer.delete(f"/api/forms/{form['id']}/").status_code == 204
    assert not StoredFile.objects.filter(pk__in=[img, guide]).exists()


@pytest.mark.django_db(transaction=True)
def test_form_numbering(designer, make_user, client_for):
    form = designer.post("/api/forms/", {"code": "numbered", "title": "شماره‌دار", "fill_by_everyone": True, "number_pattern": "{seq:3}"}, format="json")
    assert "باید {year} داشته باشد" in form.json()["fields"]["number_pattern"]
    form = designer.post(
        "/api/forms/", {"code": "numbered", "title": "شماره‌دار", "fill_by_everyone": True, "number_pattern": "خ-{year}-{seq:3}"}, format="json"
    ).json()
    draft = form["draft_version"]
    designer.patch(
        f"/api/forms/versions/{draft}/", {"definition": {"sections": [{"id": "s", "fields": [{"id": "t", "type": "text", "label": "عنوان"}]}]}}, format="json"
    )
    designer.post(f"/api/forms/versions/{draft}/publish/")
    c = client_for(make_user("filler"))
    first = c.post("/api/forms/submissions/", {"form": form["id"], "data": {"t": "الف"}, "submit": True}, format="json").json()
    draft_sub = c.post("/api/forms/submissions/", {"form": form["id"], "data": {"t": "ب"}, "submit": False}, format="json").json()
    second = c.post("/api/forms/submissions/", {"form": form["id"], "data": {"t": "ج"}, "submit": True}, format="json").json()
    assert first["number"].endswith("-001") and first["number"].startswith("خ-14") and second["number"].endswith("-002") and draft_sub["number"] == ""
    # تغییر الگو شمارنده را از نو شروع نمی‌کند
    assert designer.patch(f"/api/forms/{form['id']}/", {"number_pattern": "ف/{year}/{seq:4}"}, format="json").status_code == 200
    third = c.post("/api/forms/submissions/", {"form": form["id"], "data": {"t": "د"}, "submit": True}, format="json").json()
    assert third["number"].startswith("ف/") and third["number"].endswith("/0003")


@pytest.mark.django_db(transaction=True)
def test_export_import_and_templates(designer):
    form = designer.post("/api/forms/", {"code": "guide-form", "title": "فرم راهنما", "number_pattern": "{year}-{seq:3}"}, format="json").json()
    img = upload(designer, "chart.png", PNG)
    fields = [{"id": "img", "type": "image", "props": {"file": img}}, {"id": "name", "type": "text", "label": "نام"}]
    designer.patch(f"/api/forms/versions/{form['draft_version']}/", {"definition": {"sections": [{"id": "s", "fields": fields}], "steps": True}}, format="json")
    r = designer.get(f"/api/forms/{form['id']}/export/")
    assert r.status_code == 200 and "guide-form-v1.nikyar-form.json" in r["Content-Disposition"]
    exported = r.content
    # ورود: فرم تازه با شناسه‌ی یکتا، فایل تازه و همان تعریف
    r = designer.post("/api/forms/import/", {"file": SimpleUploadedFile("f.json", exported)}, format="multipart")
    assert r.status_code == 201, r.json()
    imported = r.json()
    assert imported["code"] == "guide-form-2" and imported["title"] == "فرم راهنما" and imported["number_pattern"] == "{year}-{seq:3}"
    definition = designer.get(f"/api/forms/versions/{imported['draft_version']}/").json()["definition"]
    new_img = definition["sections"][0]["fields"][0]["props"]["file"]
    assert definition["steps"] is True and new_img != img and StoredFile.objects.get(pk=new_img).claimed
    assert AuditLog.objects.filter(action=AuditLog.Action.CREATE, object_repr__contains="فرم راهنما").count() >= 2
    # فایل نادرست
    bad = designer.post("/api/forms/import/", {"file": SimpleUploadedFile("x.json", b'{"a": 1}')}, format="multipart").json()
    assert "فایل فرم نیک‌یار نیست" in bad["detail"]
    broken = exported.replace(b'"type": "text"', b'"type": "rocket"')
    assert "ایراد دارد" in designer.post("/api/forms/import/", {"file": SimpleUploadedFile("x.json", broken)}, format="multipart").json()["detail"]
    # الگوها
    templates = designer.get("/api/forms/templates/").json()
    assert {t["key"] for t in templates} == {"purchase_request", "warehouse_request", "meeting_minutes", "evaluation"}
    created = designer.post("/api/forms/templates/purchase_request/").json()
    assert created["code"] == "purchase-request" and created["title"] == "درخواست خرید"
    assert designer.post(f"/api/forms/versions/{created['draft_version']}/publish/").status_code == 200


def _simple_form(designer, code, **settings):
    form = designer.post("/api/forms/", {"code": code, "title": code, "fill_by_everyone": True, **settings}, format="json").json()
    fields = [{"id": "t", "type": "text", "label": "عنوان"}]
    designer.patch(f"/api/forms/versions/{form['draft_version']}/", {"definition": {"sections": [{"id": "s", "fields": fields}]}}, format="json")
    assert designer.post(f"/api/forms/versions/{form['draft_version']}/publish/").status_code == 200
    return form


def _submit(client, form, submit=True, text="الف"):
    return client.post("/api/forms/submissions/", {"form": form["id"], "data": {"t": text}, "submit": submit}, format="json")


@pytest.mark.django_db(transaction=True)
def test_acceptance_window_capacity_and_user_limit(designer, make_user, client_for):
    from datetime import timedelta

    from django.utils import timezone

    later = (timezone.now() + timedelta(days=2)).isoformat()
    soon = _simple_form(designer, "soon", opens_at=later)
    a = client_for(make_user("acc_a"))
    r = _submit(a, soon, submit=False)
    assert r.status_code == 400 and "باز می‌شود" in r.json()["detail"]
    status = {f["code"]: f["availability"] for f in a.get("/api/forms/available/").json()}
    assert status["soon"]["code"] == "not_yet"
    # پایان پیش از آغاز پذیرفته نیست
    bad = designer.patch(f"/api/forms/{soon['id']}/", {"closes_at": (timezone.now() + timedelta(days=1)).isoformat()}, format="json")
    assert "بعد از آغاز" in bad.json()["fields"]["closes_at"]

    capped = _simple_form(designer, "capped", capacity=2, per_user_limit=1)
    b = client_for(make_user("acc_b"))
    assert _submit(a, capped).status_code == 201
    again = _submit(a, capped)
    assert again.status_code == 400 and "پیش‌تر پر کرده‌اید" in again.json()["detail"]
    assert {f["code"]: f["availability"] for f in b.get("/api/forms/available/").json()}["capped"] == {"code": "open", "message": "", "remaining": 1}
    assert _submit(b, capped).status_code == 201
    full = _submit(client_for(make_user("acc_c")), capped)
    assert full.status_code == 400 and "ظرفیت" in full.json()["detail"]


@pytest.mark.django_db(transaction=True)
def test_drafts_edit_window_anonymous_and_notifications(designer, make_user, client_for):
    from core.notifications.models import Notification

    watcher = make_user("watcher")
    form = _simple_form(
        designer,
        "settings",
        allow_drafts=False,
        edit_hours=2,
        notify_submitter=True,
        notify_users=[watcher.pk],
        anonymous=True,
        number_pattern="{seq:2}",
        number_reset="never",
    )
    user = make_user("anon_filler", first_name="سارا", last_name="محمدی")
    c = client_for(user)
    assert "پیش‌نویس نمی‌پذیرد" in _submit(c, form, submit=False).json()["detail"]
    sub = _submit(c, form).json()
    assert sub["editable_until"] and sub["number"] == "01"
    # ویرایش در مهلت: همان شماره؛ برگشت به پیش‌نویس نه
    r = c.patch(f"/api/forms/submissions/{sub['id']}/", {"data": {"t": "تازه"}, "submit": True}, format="json")
    assert r.status_code == 200 and r.json()["data"] == {"t": "تازه"} and r.json()["number"] == "01"
    assert "برنمی‌گردد" in c.patch(f"/api/forms/submissions/{sub['id']}/", {"data": {"t": "x"}, "submit": False}, format="json").json()["detail"]
    # بینندگان نام ثبت‌کننده‌ی فرم بی‌نام را نمی‌بینند
    seen = designer.get(f"/api/forms/submissions/{sub['id']}/").json()
    assert seen["created_by_name"] == "بی‌نام" and seen["created_by"] is None and seen["editable_until"] is None
    assert c.get(f"/api/forms/submissions/{sub['id']}/").json()["created_by_name"] == "سارا محمدی"
    texts = dict(Notification.objects.values_list("user__username", "text"))
    assert texts["anon_filler"] == "فرم «settings» ثبت شد؛ شماره‌ی پیگیری: ۰۱." and texts["watcher"] == "ثبت تازه در فرم «settings» از بی‌نام؛ شماره: ۰۱."
    # فرم بی‌نام فیلد ثبت‌کننده نمی‌پذیرد
    draft = designer.post(f"/api/forms/{form['id']}/new-draft/").json()["id"]
    fields = [{"id": "t", "type": "text", "label": "عنوان"}, {"id": "me", "type": "submitter", "label": "ثبت‌کننده"}]
    designer.patch(f"/api/forms/versions/{draft}/", {"definition": {"sections": [{"id": "s", "fields": fields}]}}, format="json")
    assert "بی‌نام" in designer.post(f"/api/forms/versions/{draft}/publish/").json()["detail"]


@pytest.mark.django_db(transaction=True)
def test_old_drafts_removed(designer, make_user, client_for):
    from datetime import timedelta

    from django.utils import timezone

    from core.forms.service import remove_old_drafts

    form = _simple_form(designer, "drafty", draft_days=7)
    c = client_for(make_user("drafter"))
    old, fresh = _submit(c, form, submit=False).json(), _submit(c, form, submit=False).json()
    Submission.objects.filter(pk=old["id"]).update(updated_at=timezone.now() - timedelta(days=8))
    assert remove_old_drafts() == 1
    assert not Submission.objects.filter(pk=old["id"]).exists() and Submission.objects.filter(pk=fresh["id"]).exists()


@pytest.mark.django_db(transaction=True)
def test_report_and_viewable_forms(designer, make_user, client_for):
    viewer_role = Role.objects.create(name="بیننده‌ی گزارش", permissions=[])
    viewer = make_user("report_viewer")
    viewer.roles.add(viewer_role)
    form = _simple_form(designer, "reported")
    designer.patch(f"/api/forms/{form['id']}/", {"view_roles": [viewer_role.pk]}, format="json")
    filler = client_for(make_user("report_filler", first_name="سارا", last_name="محمدی"))
    _submit(filler, form)
    _submit(filler, form, submit=False)  # پیش‌نویس در گزارش نمی‌آید

    v = client_for(viewer)
    assert v.get("/api/auth/session/").json()["forms_viewer"] is True
    assert filler.get("/api/auth/session/").json()["forms_viewer"] is False
    listed = {f["code"]: f for f in v.get("/api/forms/viewable/").json()}
    assert set(listed) == {"reported"} and listed["reported"]["submission_count"] == 1
    report = v.get(f"/api/forms/{form['id']}/report/").json()
    assert report["title"] == "reported" and report["truncated"] is False
    assert [s["created_by_name"] for s in report["submissions"]] == ["سارا محمدی"]
    assert report["definition"]["sections"][0]["fields"][0]["id"] == "t"
    # دیگران گزارش را نمی‌بینند
    assert filler.get(f"/api/forms/{form['id']}/report/").status_code == 403
