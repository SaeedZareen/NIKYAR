import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test"
import { collectErrors, confirmReview, expectAccessible } from "./helpers"

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

const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const PASSWORD = "First-Pass-123"

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

/** فرایند منتشرشده با فرم اصلی «موضوع» و شماره‌ی پیگیری؛ بی مرحله (شروع تا پایان). */
async function publishedProcess(page: Page, title: string) {
  await page.goto("/requests/new")
  const form = await call(page, "POST", "/api/forms/", { code: unique("rq"), title: `فرم ${title}`, fill_by_everyone: true })
  const definition = {
    sections: [
      {
        id: "s",
        fields: [
          { id: "subject", type: "text", label: "موضوع", required: true },
          { id: "ref", type: "hidden", label: "شماره‌ی درخواست", props: { process_value: "number" } },
        ],
      },
    ],
  }
  await call(page, "PATCH", `/api/forms/versions/${form.draft_version}/`, { definition })
  await call(page, "POST", `/api/forms/versions/${form.draft_version}/publish/`)
  const process = await call(page, "POST", "/api/workflow/processes/", { code: unique("p"), title, form: form.id, number_pattern: "د-{year}-{seq:3}" })
  await call(page, "POST", `/api/workflow/versions/${process.draft_version}/publish/`)
  return process as { id: number }
}

test.describe("درخواست جدید", () => {
  test("پیش‌نویس خودکار، ثبت به نام همکار، ادامه از فهرست و ثبت با شماره", async ({ page }, info) => {
    const errors = collectErrors(page)
    const title = `درخواست آزمون ${info.project.name} ${Date.now()}`
    await publishedProcess(page, title)
    const username = unique("rq")
    await call(page, "POST", "/api/auth/users/", { username, first_name: "رضا", last_name: `همکار ${info.project.name}`, gender: "male", must_change_password: false, password: "First-Pass-123" })
    const colleague = `رضا همکار ${info.project.name}`

    await page.goto("/requests/new")
    await expect(page.getByRole("heading", { level: 1, name: "درخواست جدید" })).toBeVisible()
    await page.getByRole("link", { name: title }).click()
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()

    // ثبت به نام دیگری (مدیر کل اجازه دارد)
    const behalf = page.getByRole("region", { name: "ثبت‌کننده" })
    await behalf.getByRole("combobox").click()
    await page.getByPlaceholder("نام، نام کاربری یا موبایل").fill(username)
    await page.getByRole("option", { name: new RegExp(colleague) }).click()
    await expect(behalf.getByRole("combobox")).toContainText(colleague)

    await page.getByLabel("موضوع", { exact: true }).fill("خرید صندلی")
    await expect(page.getByText(/پیش‌نویس ذخیره شد/)).toBeVisible()
    await expect(page).toHaveURL(/draft=\d+/)
    await expectAccessible(page)

    // ادامه از پیش‌نویس‌ها: «به نام» و داده می‌ماند
    await page.goto("/requests/new")
    const drafts = page.getByRole("region", { name: "پیش‌نویس‌های درخواست" })
    await expect(drafts.getByText(colleague).first()).toBeVisible()
    await drafts.getByText(title).first().click()
    await expect(page.getByLabel("موضوع", { exact: true })).toHaveValue("خرید صندلی")
    await expect(page.getByRole("region", { name: "ثبت‌کننده" }).getByRole("combobox")).toContainText(colleague)

    await page.getByRole("button", { name: "ثبت نهایی" }).click()
    await confirmReview(page)
    const status = page.getByRole("status").filter({ hasText: "شماره‌ی پیگیری" })
    await expect(status).toContainText(`درخواست «${title}» ثبت شد.`)
    await expect(status).toContainText(/د-[۰-۹]{4}-[۰-۹]{3}/)
    await expect(page.getByRole("link", { name: "ثبت درخواست دیگر" })).toBeVisible()
    await expectAccessible(page)

    // به نام همکار ثبت شده و شماره در فیلد پنهان فرم هم نشسته است
    const list = await call(page, "GET", "/api/workflow/requests/?status=completed")
    const sent = list.results.find((r: { process_title: string }) => r.process_title === title)
    expect(sent.requester_name).toContain(colleague)
    expect(sent.data.ref).toBe(sent.number)
    await page.getByRole("link", { name: "بازگشت به درخواست جدید" }).click()
    await expect(page.getByRole("region", { name: "پیش‌نویس‌های درخواست" }).getByText(title)).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test("حذف پیش‌نویس درخواست", async ({ page }, info) => {
    const title = `حذف پیش‌نویس ${info.project.name} ${Date.now()}`
    await publishedProcess(page, title)
    await page.goto("/requests/new")
    await page.getByRole("link", { name: title }).click()
    await page.getByLabel("موضوع", { exact: true }).fill("موقت")
    await expect(page).toHaveURL(/draft=\d+/)
    await page.getByRole("button", { name: "حذف پیش‌نویس", exact: true }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "حذف پیش‌نویس" }).click()
    await expect(page.getByText("پیش‌نویس حذف شد.")).toBeVisible()
    await expect(page).toHaveURL(/\/requests\/new$/)
    await expect(page.getByRole("link", { name: title })).toBeVisible()
  })

  test("درخواست‌های من: صفحه‌ی درخواست با نمودار، مرحله‌ی منتظر، لغو و چاپ", async ({ page: admin, browser }, info) => {
    const title = `پیگیری ${info.project.name} ${Date.now()}`
    await admin.goto("/requests")
    const username = unique("tr")
    await call(admin, "POST", "/api/auth/users/", { username, first_name: "مینا", last_name: "پیگیر", gender: "female", must_change_password: false, password: PASSWORD })
    const form = await call(admin, "POST", "/api/forms/", { code: unique("tr"), title: `فرم ${title}`, fill_by_everyone: true })
    await call(admin, "PATCH", `/api/forms/versions/${form.draft_version}/`, { definition: { sections: [{ id: "s", fields: [{ id: "subject", type: "text", label: "موضوع" }] }] } })
    await call(admin, "POST", `/api/forms/versions/${form.draft_version}/publish/`)
    const process = await call(admin, "POST", "/api/workflow/processes/", { code: unique("tp"), title, form: form.id, number_pattern: "پ-{year}-{seq:3}", start_by_everyone: true })
    const bpmn =
      '<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:spiffworkflow="http://spiffworkflow.org/bpmn/schema/1.0/core" id="d" targetNamespace="http://bpmn.io/schema/bpmn"><bpmn:process id="tr" isExecutable="true">' +
      '<bpmn:startEvent id="start"><bpmn:outgoing>f0</bpmn:outgoing></bpmn:startEvent>' +
      '<bpmn:userTask id="review" name="بررسی"><bpmn:extensionElements><spiffworkflow:properties><spiffworkflow:property name="assignee" value=\'{"type":"requester"}\'/></spiffworkflow:properties></bpmn:extensionElements><bpmn:incoming>f0</bpmn:incoming><bpmn:outgoing>f1</bpmn:outgoing></bpmn:userTask>' +
      '<bpmn:endEvent id="end"><bpmn:incoming>f1</bpmn:incoming></bpmn:endEvent>' +
      '<bpmn:sequenceFlow id="f0" sourceRef="start" targetRef="review"/><bpmn:sequenceFlow id="f1" sourceRef="review" targetRef="end"/></bpmn:process>' +
      '<bpmndi:BPMNDiagram id="dg"><bpmndi:BPMNPlane id="pl" bpmnElement="tr">' +
      '<bpmndi:BPMNShape id="s_di" bpmnElement="start"><dc:Bounds x="100" y="100" width="36" height="36"/></bpmndi:BPMNShape>' +
      '<bpmndi:BPMNShape id="r_di" bpmnElement="review"><dc:Bounds x="200" y="78" width="100" height="80"/></bpmndi:BPMNShape>' +
      '<bpmndi:BPMNShape id="e_di" bpmnElement="end"><dc:Bounds x="360" y="100" width="36" height="36"/></bpmndi:BPMNShape>' +
      '<bpmndi:BPMNEdge id="f0_di" bpmnElement="f0"><di:waypoint x="136" y="118"/><di:waypoint x="200" y="118"/></bpmndi:BPMNEdge>' +
      '<bpmndi:BPMNEdge id="f1_di" bpmnElement="f1"><di:waypoint x="300" y="118"/><di:waypoint x="360" y="118"/></bpmndi:BPMNEdge>' +
      "</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>"
    await call(admin, "PATCH", `/api/workflow/versions/${process.draft_version}/`, { bpmn })
    await call(admin, "POST", `/api/workflow/versions/${process.draft_version}/publish/`)
    const page = await signIn(browser, info, username)
    const errors = collectErrors(page)
    const sent = await call(page, "POST", "/api/workflow/requests/", { process: process.id, data: { subject: "میز" }, submit: true })

    await page.goto("/requests")
    await expect(page.getByRole("heading", { level: 1, name: "درخواست‌های من" })).toBeVisible()
    await page.goto(`/requests/${sent.id}`)
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(title) })).toBeVisible()
    await expect(page.getByRole("list", { name: "مرحله‌های منتظر" })).toContainText("بررسی")
    const diagram = page.getByRole("region", { name: "نمودار درخواست" })
    await expect(diagram.locator('.djs-element.nk-active[data-element-id="review"]')).toHaveCount(1)
    await expect(diagram.locator('.djs-element.nk-done[data-element-id="start"]')).toHaveCount(1)
    await expect(page.getByRole("region", { name: "مدیریت درخواست" })).toHaveCount(0)
    await expectAccessible(page)

    await page.getByRole("button", { name: "لغو درخواست" }).click()
    const dialog = page.getByRole("dialog", { name: "لغو درخواست" })
    await dialog.getByLabel("دلیل (اختیاری)", { exact: true }).fill("اشتباه ثبت شد")
    await dialog.getByRole("button", { name: "لغو درخواست" }).click()
    await expect(page.getByText("درخواست لغو شد.")).toBeVisible()
    await expect(page.getByRole("button", { name: "لغو درخواست" })).toHaveCount(0)
    await expect(page.getByRole("region", { name: "تاریخچه" })).toContainText("اشتباه ثبت شد")

    await page.goto(`/print/requests/${sent.id}`)
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()
    await expect(page.getByRole("region", { name: "تأییدها" })).toContainText("هنوز مرحله‌ای تصمیم نگرفته است.")
    expect(errors).toEqual([])
  })
})
