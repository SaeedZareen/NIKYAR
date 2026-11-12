// خواندن و نوشتن تنظیمات نیک‌یار روی عنصرهای BPMN (spiffworkflow:properties، مقدار JSON)، همه با فرمان‌های
// bpmn-js (modeling) تا واگرد و ذخیره‌ی خودکار کار کنند. هم‌سو با core/workflow/bpmn.py.
/* سرویس‌ها و عنصرهای bpmn-js نوع‌دهی کامل ندارند */
type Any = any // eslint-disable-line @typescript-eslint/no-explicit-any

export type ElementInfo = {
  id: string
  type: string
  name: string
  props: Record<string, unknown>
  /** مسیر: شرط اجرایی (پایتون) و مسیر پیش‌فرض بودن؛ مبدأ و مقصد. */
  condition?: string
  isDefault?: boolean
  sourceType?: string
  sourceId?: string
}

const PROPS = "spiffworkflow:Properties"
const OPERATOR = "spiffworkflow:ServiceTaskOperator"

function parse(value: string | undefined): unknown {
  try {
    return value === undefined ? undefined : JSON.parse(value)
  } catch {
    return value
  }
}

export function propsOf(bo: Any): Record<string, unknown> {
  const ext = (bo?.extensionElements?.values ?? []).find((v: Any) => v.$type === PROPS)
  return Object.fromEntries((ext?.properties ?? []).map((p: Any) => [p.name, parse(p.value)]))
}

export function infoOf(element: Any): ElementInfo {
  const bo = element.businessObject
  const info: ElementInfo = { id: element.id, type: element.type, name: bo.name ?? "", props: propsOf(bo) }
  if (element.type === "bpmn:SequenceFlow") {
    info.condition = bo.conditionExpression?.body ?? ""
    info.sourceType = bo.sourceRef?.$type
    info.sourceId = bo.sourceRef?.id
    info.isDefault = bo.sourceRef?.default?.id === bo.id
  }
  return info
}

/** ویژگی‌ها را جایگزین یا حذف (undefined) می‌کند؛ عنصرهای افزوده‌ی دیگر (مثل عملگر کار خودکار) می‌مانند. */
export function setProps(modeler: Any, element: Any, patch: Record<string, unknown>) {
  const moddle = modeler.get("moddle")
  const bo = element.businessObject
  const next = { ...propsOf(bo), ...patch }
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
  const values = (bo.extensionElements?.values ?? []).filter((v: Any) => v.$type !== PROPS)
  if (element.type === "bpmn:ServiceTask" && !values.some((v: Any) => v.$type === OPERATOR)) values.push(moddle.create(OPERATOR, { id: "nikyar" }))
  if (Object.keys(next).length) {
    const properties = Object.entries(next).map(([name, value]) => moddle.create("spiffworkflow:Property", { name, value: JSON.stringify(value) }))
    values.push(moddle.create(PROPS, { properties }))
  }
  modeler.get("modeling").updateProperties(element, { extensionElements: values.length ? moddle.create("bpmn:ExtensionElements", { values }) : undefined })
}

export function setName(modeler: Any, element: Any, name: string) {
  modeler.get("modeling").updateProperties(element, { name: name || undefined })
}

/** شرط مسیر: عبارت اجرایی و مدل سازنده (برای ویرایش دوباره). */
export function setCondition(modeler: Any, flow: Any, python: string | null, logic: unknown) {
  const moddle = modeler.get("moddle")
  const expression = python ? moddle.create("bpmn:FormalExpression", { body: python }) : undefined
  modeler.get("modeling").updateProperties(flow, { conditionExpression: expression })
  setProps(modeler, flow, { condition: logic ?? undefined })
}

/** مسیر پیش‌فرض دروازه؛ مسیر پیش‌فرض شرط ندارد. */
export function setDefault(modeler: Any, flow: Any, on: boolean) {
  const registry = modeler.get("elementRegistry")
  const gateway = registry.get(flow.businessObject.sourceRef.id)
  modeler.get("modeling").updateProperties(gateway, { default: on ? flow.businessObject : undefined })
  if (on) setCondition(modeler, flow, null, undefined)
}

/** شناسه‌ی همه‌ی کارهای کاربری با عنوانشان (برای «مدیر انجام‌دهنده‌ی مرحله‌ی قبل»). */
export function userTasks(modeler: Any): { id: string; name: string }[] {
  return modeler
    .get("elementRegistry")
    .filter((e: Any) => e.type === "bpmn:UserTask")
    .map((e: Any) => ({ id: e.id, name: e.businessObject.name || "کار کاربری بی‌عنوان" }))
}

export const DEFAULT_DECISIONS = [
  { value: "approve", label: "تأیید" },
  { value: "reject", label: "رد", comment: "required" },
] as const

/** تصمیم‌های کارهای کاربری که به این دروازه می‌رسند (گزینه‌های «تصمیم مرحله‌ی قبل» در شرط). */
export function decisionsBefore(modeler: Any, gatewayId: string): { value: string; label: string }[] {
  const gateway = modeler.get("elementRegistry").get(gatewayId)
  const found = new Map<string, string>()
  for (const flow of gateway?.incoming ?? []) {
    const source = flow.source
    if (source?.type !== "bpmn:UserTask") continue
    const decisions = (propsOf(source.businessObject).decisions as { value: string; label: string }[] | undefined) ?? DEFAULT_DECISIONS
    for (const d of decisions) found.set(d.value, d.label)
  }
  return [...found].map(([value, label]) => ({ value, label }))
}
