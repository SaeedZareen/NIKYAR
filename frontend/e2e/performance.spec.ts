import { expect, test, type Page } from "@playwright/test"
import { collectErrors, expectAccessible } from "./helpers"

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

const task = (id: string, name: string, incoming: string, outgoing: string) =>
  `<bpmn:userTask id="${id}" name="${name}"><bpmn:extensionElements><spiffworkflow:properties><spiffworkflow:property name="assignee" value='{"type":"requester"}'/></spiffworkflow:properties></bpmn:extensionElements><bpmn:incoming>${incoming}</bpmn:incoming><bpmn:outgoing>${outgoing}</bpmn:outgoing></bpmn:userTask>`
const BPMN =
  '<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:spiffworkflow="http://spiffworkflow.org/bpmn/schema/1.0/core" id="d" targetNamespace="http://bpmn.io/schema/bpmn"><bpmn:process id="pf" isExecutable="true">' +
  '<bpmn:startEvent id="start"><bpmn:outgoing>f0</bpmn:outgoing></bpmn:startEvent>' +
  task("review", "بررسی کارشناس", "f0", "f1") +
  task("final", "تأیید نهایی", "f1", "f2") +
  '<bpmn:endEvent id="end"><bpmn:incoming>f2</bpmn:incoming></bpmn:endEvent>' +
  '<bpmn:sequenceFlow id="f0" sourceRef="start" targetRef="review"/><bpmn:sequenceFlow id="f1" sourceRef="review" targetRef="final"/><bpmn:sequenceFlow id="f2" sourceRef="final" targetRef="end"/>' +
  "</bpmn:process></bpmn:definitions>"

test("گزارش عملکرد: خلاصه، گلوگاه‌ها، افراد و فیلتر فرایند", async ({ page }, info) => {
  const errors = collectErrors(page)
  const title = `عملکرد ${info.project.name} ${Date.now()}`
  await page.goto("/workflow/performance")
  const form = await call(page, "POST", "/api/forms/", { code: unique("pf"), title: `فرم ${title}`, fill_by_everyone: true })
  await call(page, "PATCH", `/api/forms/versions/${form.draft_version}/`, { definition: { sections: [{ id: "s", fields: [{ id: "subject", type: "text", label: "موضوع" }] }] } })
  await call(page, "POST", `/api/forms/versions/${form.draft_version}/publish/`)
  const process = await call(page, "POST", "/api/workflow/processes/", { code: unique("pp"), title, form: form.id })
  await call(page, "PATCH", `/api/workflow/versions/${process.draft_version}/`, { bpmn: BPMN })
  await call(page, "POST", `/api/workflow/versions/${process.draft_version}/publish/`)
  const sent = await call(page, "POST", "/api/workflow/requests/", { process: process.id, data: { subject: "میز" }, submit: true })
  const mine = await call(page, "GET", "/api/workflow/tasks/?box=mine")
  const review = mine.find((t: { request: number }) => t.request === sent.id)
  await call(page, "POST", `/api/workflow/tasks/${review.id}/complete/`, { decision: "approve" })

  await page.reload()
  await expect(page.getByRole("heading", { level: 1, name: "گزارش عملکرد" })).toBeVisible()
  await page.getByRole("combobox", { name: "فرایند" }).click()
  await page.getByRole("option", { name: title }).click()
  const summary = page.getByRole("region", { name: "خلاصه" })
  await expect(summary.getByText("درخواست‌ها", { exact: true }).locator("xpath=..")).toContainText("۱")
  await expect(summary).toContainText("۱ در جریان")

  const steps = page.getByRole("tabpanel", { name: "مرحله‌ها و گلوگاه‌ها" })
  await expect(steps.getByRole("img", { name: /کندترین مرحله‌ها: بررسی کارشناس/ })).toBeVisible()
  await expect(steps.getByText("تأیید نهایی").first()).toBeVisible()
  await expectAccessible(page)

  await page.getByRole("tab", { name: "افراد" }).click()
  const people = page.getByRole("tabpanel", { name: "افراد" })
  await expect(people.getByRole("img", { name: /کارهای منتظر هر نفر: مدیر سامانه ۱/ })).toBeVisible()
  await page.getByRole("tab", { name: "واحدها" }).click()
  await expect(page.getByRole("tabpanel", { name: "واحدها" }).getByText(/۱/).first()).toBeVisible()
  await expectAccessible(page)
  expect(errors).toEqual([])
})
