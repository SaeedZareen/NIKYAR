import { expect, test, type Page } from "@playwright/test"
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

const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

test.describe("مدیریت درخواست‌ها", () => {
  test("فهرست مدیر، ارجاع دوباره، شروع دوباره و لغو با دلیل", async ({ page }, info) => {
    const errors = collectErrors(page)
    const title = `مدیریت ${info.project.name} ${Date.now()}`
    await page.goto("/workflow/requests")
    const username = unique("mg")
    await call(page, "POST", "/api/auth/users/", { username, first_name: "نوید", last_name: `جایگزین ${info.project.name}`, gender: "male", password: "First-Pass-123" })
    const form = await call(page, "POST", "/api/forms/", { code: unique("mf"), title: `فرم ${title}`, fill_by_everyone: true })
    await call(page, "PATCH", `/api/forms/versions/${form.draft_version}/`, { definition: { sections: [{ id: "s", fields: [{ id: "subject", type: "text", label: "موضوع" }] }] } })
    await call(page, "POST", `/api/forms/versions/${form.draft_version}/publish/`)
    const process = await call(page, "POST", "/api/workflow/processes/", { code: unique("mp"), title, form: form.id })
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
    await call(page, "PATCH", `/api/workflow/versions/${process.draft_version}/`, { bpmn })
    await call(page, "POST", `/api/workflow/versions/${process.draft_version}/publish/`)
    const sent = await call(page, "POST", "/api/workflow/requests/", { process: process.id, data: { subject: "میز" }, submit: true })

    await page.goto("/workflow/requests")
    await expect(page.getByRole("heading", { level: 1, name: "مدیریت درخواست‌ها" })).toBeVisible()
    const panel = page.getByRole("tabpanel")
    if (isMobile(page)) await panel.getByRole("listitem").filter({ hasText: title }).getByRole("link").click()
    else await panel.getByText(title).first().click()
    await expect(page).toHaveURL(new RegExp(`/requests/${sent.id}$`))
    const manage = page.getByRole("region", { name: "مدیریت درخواست" })
    await expectAccessible(page)

    // ارجاع دوباره بی دلیل پذیرفته نیست
    await manage.getByRole("button", { name: "ارجاع دوباره" }).click()
    let dialog = page.getByRole("dialog", { name: "ارجاع دوباره" })
    await dialog.getByRole("combobox", { name: "گیرنده‌ی تازه" }).click()
    await page.getByPlaceholder("نام، نام کاربری یا موبایل").fill(username)
    await page.getByRole("option", { name: new RegExp(`جایگزین ${info.project.name}`) }).click()
    await dialog.getByRole("button", { name: "ارجاع دوباره" }).click()
    await expect(dialog.getByText("دلیل این کار در تاریخچه‌ی درخواست ثبت می‌شود.")).toBeVisible()
    await dialog.getByLabel("دلیل", { exact: true }).fill("در مرخصی است")
    await dialog.getByRole("button", { name: "ارجاع دوباره" }).click()
    await expect(page.getByText("کار به گیرنده‌ی تازه ارجاع شد.")).toBeVisible()
    await expect(page.getByRole("list", { name: "مرحله‌های منتظر" })).toContainText(`جایگزین ${info.project.name}`)

    await manage.getByRole("button", { name: "شروع دوباره" }).click()
    dialog = page.getByRole("dialog", { name: "شروع دوباره" })
    await dialog.getByLabel("دلیل", { exact: true }).fill("فرم اصلاح شد")
    await dialog.getByRole("button", { name: "شروع دوباره" }).click()
    await expect(page.getByText("درخواست از نو شروع شد.")).toBeVisible()

    await manage.getByRole("button", { name: "لغو با دلیل" }).click()
    dialog = page.getByRole("dialog", { name: "لغو درخواست" })
    await dialog.getByLabel("دلیل", { exact: true }).fill("بودجه تمام شد")
    await dialog.getByRole("button", { name: "لغو درخواست" }).click()
    await expect(page.getByText("درخواست لغو شد.")).toBeVisible()
    await expect(page.getByRole("region", { name: "مدیریت درخواست" })).toHaveCount(0)
    const history = page.getByRole("region", { name: "تاریخچه" })
    await expect(history).toContainText("در مرخصی است")
    await expect(history).toContainText("فرم اصلاح شد")
    await expect(history).toContainText("بودجه تمام شد")
    expect(errors).toEqual([])
  })
})
