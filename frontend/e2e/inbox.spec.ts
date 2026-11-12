import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test"
import { collectErrors, expectAccessible, isMobile } from "./helpers"

async function call(page: Page, method: string, url: string, body?: unknown) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const token = decodeURIComponent(document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "")
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json", "X-CSRFToken": token }, body: body ? JSON.stringify(body) : undefined })
      return r.json()
    },
    { method, url, body }
  )
}

const unique = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const PASSWORD = "First-Pass-123"

const prop = (name: string, value: unknown) => `<spiffworkflow:property name="${name}" value='${JSON.stringify(value)}'/>`
const userTask = (id: string, name: string, props: Record<string, unknown>, from: string, to: string) =>
  `<bpmn:userTask id="${id}" name="${name}"><bpmn:extensionElements><spiffworkflow:properties>${Object.entries(props)
    .map(([k, v]) => prop(k, v))
    .join("")}</spiffworkflow:properties></bpmn:extensionElements><bpmn:incoming>${from}</bpmn:incoming><bpmn:outgoing>${to}</bpmn:outgoing></bpmn:userTask>`
const flow = (id: string, source: string, target: string) => `<bpmn:sequenceFlow id="${id}" sourceRef="${source}" targetRef="${target}"/>`

/** مدیر (کاربر مشخص، با یادداشت الزامی برای رد) ← کارپردازی (نقش؛ کار گروهی) ← پایان */
function bpmn(bossId: number, roleId: number) {
  const decisions = [
    { value: "ok", label: "تأیید" },
    { value: "no", label: "رد", comment: "required" },
  ]
  return (
    '<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:spiffworkflow="http://spiffworkflow.org/bpmn/schema/1.0/core" id="d" targetNamespace="http://bpmn.io/schema/bpmn"><bpmn:process id="inbox" isExecutable="true">' +
    '<bpmn:startEvent id="start"><bpmn:outgoing>f0</bpmn:outgoing></bpmn:startEvent>' +
    userTask("boss_ok", "تأیید مدیر", { assignee: { type: "user", user: bossId }, decisions, fields: { note: "edit" } }, "f0", "f1") +
    userTask("buy", "خرید کالا", { assignee: { type: "role", role: roleId } }, "f1", "f2") +
    '<bpmn:endEvent id="end"><bpmn:incoming>f2</bpmn:incoming></bpmn:endEvent>' +
    flow("f0", "start", "boss_ok") +
    flow("f1", "boss_ok", "buy") +
    flow("f2", "buy", "end") +
    "</bpmn:process></bpmn:definitions>"
  )
}

/** باز کردن کاری از جدول کارتابل (روی موبایل کارت، با پیوند عنوان مرحله). */
async function openTask(page: Page, process: string) {
  const panel = page.getByRole("tabpanel")
  if (isMobile(page)) await panel.getByRole("listitem").filter({ hasText: process }).getByRole("link").click()
  else await panel.getByText(process).first().click()
}

/** یک مرحله‌ی «همه‌ی گیرنده‌ها» برای دارندگان یک نقش */
function councilBpmn(roleId: number) {
  const decisions = [
    { value: "ok", label: "موافق" },
    { value: "no", label: "مخالف", comment: "required" },
  ]
  return (
    '<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:spiffworkflow="http://spiffworkflow.org/bpmn/schema/1.0/core" id="d" targetNamespace="http://bpmn.io/schema/bpmn"><bpmn:process id="council" isExecutable="true">' +
    '<bpmn:startEvent id="start"><bpmn:outgoing>f0</bpmn:outgoing></bpmn:startEvent>' +
    userTask("vote", "رأی کمیسیون", { assignee: { type: "role", role: roleId }, decisions, completion: "all" }, "f0", "f1") +
    '<bpmn:endEvent id="end"><bpmn:incoming>f1</bpmn:incoming></bpmn:endEvent>' +
    flow("f0", "start", "vote") +
    flow("f1", "vote", "end") +
    "</bpmn:process></bpmn:definitions>"
  )
}

async function signIn(browser: Browser, info: TestInfo, username: string) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, ...(info.project.use.viewport ? { viewport: info.project.use.viewport } : {}) })
  const page = await context.newPage()
  await page.goto("/login")
  await page.getByLabel("نام کاربری", { exact: true }).fill(username)
  await page.getByLabel("گذرواژه", { exact: true }).fill(PASSWORD)
  await page.getByRole("button", { name: "ورود" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "پیشخوان" })).toBeVisible()
  return page
}

test.describe("کارتابل", () => {
  test("تصمیم با یادداشت الزامی، ویرایش فیلد مرحله، برداشتن و رها کردن کار گروهی", async ({ page, browser }, info) => {
    await page.goto("/")
    const role = await call(page, "POST", "/api/auth/roles/", { name: unique("کارپردازی"), permissions: [] })
    const bossName = unique("boss")
    const boss = await call(page, "POST", "/api/auth/users/", { username: bossName, first_name: "بهرام", last_name: "مدیری", gender: "male", password: PASSWORD, roles: [role.id] })
    await call(page, "POST", "/api/auth/users/", { username: unique("buyer"), first_name: "سارا", last_name: "خریدار", gender: "female", password: PASSWORD, roles: [role.id] })
    const form = await call(page, "POST", "/api/forms/", { code: unique("ib").replace(/_/g, "-"), title: "فرم کارتابل", fill_by_everyone: true })
    const fields = [
      { id: "subject", type: "text", label: "موضوع", required: true },
      { id: "note", type: "textarea", label: "یادداشت مدیر" },
    ]
    await call(page, "PATCH", `/api/forms/versions/${form.draft_version}/`, { definition: { sections: [{ id: "s", fields }] } })
    await call(page, "POST", `/api/forms/versions/${form.draft_version}/publish/`)
    const title = `خرید ${info.project.name} ${Date.now()}`
    const process = await call(page, "POST", "/api/workflow/processes/", { code: unique("ib").replace(/_/g, "-"), title, form: form.id, start_by_everyone: true })
    await call(page, "PATCH", `/api/workflow/versions/${process.draft_version}/`, { bpmn: bpmn(boss.id, role.id) })
    await call(page, "POST", `/api/workflow/versions/${process.draft_version}/publish/`)
    await call(page, "POST", "/api/workflow/requests/", { process: process.id, data: { subject: "میز اداری" }, submit: true })

    const other = await signIn(browser, info, bossName)
    const errors = collectErrors(other)
    await other.goto("/tasks")
    await expect(other.getByRole("heading", { level: 1, name: "کارتابل" })).toBeVisible()
    await openTask(other, title)
    await expect(other.getByRole("heading", { level: 1, name: "تأیید مدیر" })).toBeVisible()
    await expect(other.getByLabel("موضوع", { exact: true })).toHaveValue("میز اداری")
    await expect(other.getByLabel("موضوع", { exact: true })).not.toBeEditable()
    await expectAccessible(other)

    // «رد» بی یادداشت پذیرفته نیست
    await other.getByRole("button", { name: "رد", exact: true }).click()
    await expect(other.getByText("برای «رد» نوشتن یادداشت الزامی است.")).toBeVisible()
    await other.getByLabel("یادداشت مدیر", { exact: true }).fill("سریع تهیه شود")
    await other.getByRole("button", { name: "تأیید", exact: true }).click()
    await other.getByRole("alertdialog").getByRole("button", { name: "ثبت «تأیید»" }).click()
    await expect(other.getByText("«تأیید» برای «تأیید مدیر» ثبت شد.")).toBeVisible()
    await expect(other).toHaveURL(/\/tasks$/)

    // کار بعدی گروهی است (بهرام و سارا): برداشتن، دیدن در «منتظر من»، رها کردن
    await other.getByRole("tab", { name: /گروهی/ }).click()
    await openTask(other, title)
    await expect(other.getByRole("heading", { level: 1, name: "خرید کالا" })).toBeVisible()
    await other.getByRole("button", { name: "برداشتن کار" }).click()
    await expect(other.getByText("کار را برداشتید؛ تا انجام یا رها کردن، فقط برای شماست.")).toBeVisible()
    await expect(other.getByRole("button", { name: "رها کردن" })).toBeVisible()
    await other.goto("/tasks")
    await expect(other.getByRole("tabpanel").getByText(title)).toBeVisible()
    await openTask(other, title)
    await other.getByRole("button", { name: "رها کردن" }).click()
    await expect(other.getByRole("button", { name: "برداشتن کار" })).toBeVisible()
    // تاریخچه: تصمیم و یادداشت مرحله‌ی قبل
    const history = other.getByRole("region", { name: "تاریخچه" })
    await expect(history).toContainText("تأیید مدیر: تأیید")

    await other.goto("/tasks?box=done")
    await expect(other.getByRole("tabpanel").getByText(title)).toBeVisible()
    await expectAccessible(other)
    expect(errors).toEqual([])
    await other.context().close()
  })

  test("همه‌ی گیرنده‌ها نظر می‌دهند و گفت‌وگوی درخواست", async ({ page, browser }, info) => {
    await page.goto("/")
    const role = await call(page, "POST", "/api/auth/roles/", { name: unique("کمیسیون"), permissions: [] })
    const names = [unique("m1"), unique("m2")]
    for (const [i, username] of names.entries())
      await call(page, "POST", "/api/auth/users/", { username, first_name: "عضو", last_name: `کمیسیون ${i + 1}`, gender: "male", password: PASSWORD, roles: [role.id] })
    const form = await call(page, "POST", "/api/forms/", { code: unique("cm").replace(/_/g, "-"), title: "فرم کمیسیون", fill_by_everyone: true })
    await call(page, "PATCH", `/api/forms/versions/${form.draft_version}/`, { definition: { sections: [{ id: "s", fields: [{ id: "subject", type: "text", label: "موضوع" }] }] } })
    await call(page, "POST", `/api/forms/versions/${form.draft_version}/publish/`)
    const title = `کمیسیون ${info.project.name} ${Date.now()}`
    const process = await call(page, "POST", "/api/workflow/processes/", { code: unique("cm").replace(/_/g, "-"), title, form: form.id, start_by_everyone: true })
    await call(page, "PATCH", `/api/workflow/versions/${process.draft_version}/`, { bpmn: councilBpmn(role.id) })
    await call(page, "POST", `/api/workflow/versions/${process.draft_version}/publish/`)
    await call(page, "POST", "/api/workflow/requests/", { process: process.id, data: { subject: "خرید سرور" }, submit: true })

    const first = await signIn(browser, info, names[0])
    const errors = collectErrors(first)
    await first.goto("/tasks")
    await openTask(first, title)
    await expect(first.getByRole("region", { name: "نظر گیرنده‌ها" })).toContainText("۰ از ۲ نظر")
    await first.getByLabel("پیام تازه", { exact: true }).fill("پیش‌فاکتور دوم هم لازم است.")
    await first.getByRole("button", { name: "ارسال پیام" }).click()
    await expect(first.getByRole("list", { name: "پیام‌های گفت‌وگو" })).toContainText("پیش‌فاکتور دوم هم لازم است.")
    await first.getByRole("button", { name: "موافق", exact: true }).click()
    await first.getByRole("alertdialog").getByRole("button", { name: "ثبت «موافق»" }).click()
    await expect(first.getByText("نظر «موافق» ثبت شد؛ کار منتظر نظر دیگر گیرنده‌هاست.")).toBeVisible()
    await expectAccessible(first)
    expect(errors).toEqual([])
    await first.context().close()

    // عضو دوم: پیام گفت‌وگو را می‌بیند و با نظر او کار تمام می‌شود
    const second = await signIn(browser, info, names[1])
    await second.goto("/tasks")
    await openTask(second, title)
    await expect(second.getByRole("region", { name: "نظر گیرنده‌ها" })).toContainText("۱ از ۲ نظر")
    await expect(second.getByRole("list", { name: "پیام‌های گفت‌وگو" })).toContainText("پیش‌فاکتور دوم هم لازم است.")
    await second.getByRole("button", { name: "موافق", exact: true }).click()
    await second.getByRole("alertdialog").getByRole("button", { name: "ثبت «موافق»" }).click()
    await expect(second.getByText("«موافق» برای «رأی کمیسیون» ثبت شد.")).toBeVisible()
    await second.context().close()
  })
})
