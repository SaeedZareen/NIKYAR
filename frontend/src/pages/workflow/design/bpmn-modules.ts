// تنظیم bpmn-js برای نیک‌یار: فقط عنصرهایی که موتور پشتیبانی می‌کند، برچسب‌های فارسی و رنگ‌های کیت.
// نشان bpmn.io (شرط مجوز bpmn-js) دست نمی‌خورد.

/** عنصرهای قابل ساخت (هم‌سو با ELEMENTS در core/workflow/bpmn.py). */
const CREATABLE = [
  { id: "start-event", type: "bpmn:StartEvent", title: "رویداد شروع", className: "bpmn-icon-start-event-none" },
  { id: "user-task", type: "bpmn:UserTask", title: "کار کاربری (مرحله‌ای که کسی انجام می‌دهد)", className: "bpmn-icon-user-task" },
  { id: "service-task", type: "bpmn:ServiceTask", title: "اقدام خودکار", className: "bpmn-icon-service-task" },
  { id: "exclusive-gateway", type: "bpmn:ExclusiveGateway", title: "دروازه‌ی شرطی (یکی از مسیرها)", className: "bpmn-icon-gateway-xor" },
  { id: "parallel-gateway", type: "bpmn:ParallelGateway", title: "دروازه‌ی موازی (همه‌ی مسیرها)", className: "bpmn-icon-gateway-parallel" },
  { id: "timer-event", type: "bpmn:IntermediateCatchEvent", title: "مرحله‌ی زمان‌بندی (صبر تا زمان تعیین‌شده)", className: "bpmn-icon-intermediate-event-catch-timer", timer: true },
  { id: "end-event", type: "bpmn:EndEvent", title: "رویداد پایان", className: "bpmn-icon-end-event-none" },
] as const

/** شکل تازه؛ مرحله‌ی زمان‌بندی رویداد میانی با تعریف زمان است. */
function shape(elementFactory: any, type: string, timer?: boolean) {
  return elementFactory.createShape(timer ? { type, eventDefinitionType: "bpmn:TimerEventDefinition" } : { type })
}

const TOOLS = new Set(["hand-tool", "lasso-tool", "space-tool", "global-connect-tool", "tool-separator"])
const PAD = new Set(["connect", "delete", "append.end-event", "append.gateway"])

/** برچسب‌های فارسی ابزارها و منوی کنار عنصر (کلیدها همان متن انگلیسی bpmn-js). */
const TRANSLATIONS: Record<string, string> = {
  "Activate hand tool": "جابه‌جایی بوم",
  "Activate lasso tool": "انتخاب چند عنصر",
  "Activate create/remove space tool": "باز یا بسته کردن فضا",
  "Activate global connect tool": "وصل کردن دو عنصر",
  "Append end event": "افزودن پایان",
  "Append gateway": "افزودن دروازه‌ی شرطی",
  "Connect to other element": "وصل به عنصر دیگر",
  "Connect using association": "وصل یادداشت",
  Delete: "حذف",
}

function translate(template: string, replacements?: Record<string, string>) {
  const text = TRANSLATIONS[template] ?? template
  return text.replace(/{([^}]+)}/g, (_, key) => replacements?.[key] ?? `{${key}}`)
}

function createAction(elementFactory: any, create: any, type: string, timer?: boolean) {
  return (event: Event) => create.start(event, shape(elementFactory, type, timer))
}

function PaletteFilter(this: any, palette: any, create: any, elementFactory: any) {
  palette.registerProvider(500, {
    getPaletteEntries: () => (entries: Record<string, any>) => {
      const kept = Object.fromEntries(Object.entries(entries).filter(([id]) => TOOLS.has(id)))
      for (const item of CREATABLE) {
        const action = createAction(elementFactory, create, item.type, "timer" in item)
        kept[`create.${item.id}`] = { group: "nikyar", className: item.className, title: item.title, action: { dragstart: action, click: action } }
      }
      return kept
    },
  })
}
PaletteFilter.$inject = ["palette", "create", "elementFactory"]

function ContextPadFilter(this: any, contextPad: any, create: any, elementFactory: any, autoPlace: any) {
  const append = (type: string, title: string, className: string, timer?: boolean) => ({
    group: "model",
    className,
    title,
    action: {
      click: (_event: Event, element: any) => autoPlace.append(element, shape(elementFactory, type, timer)),
      dragstart: (event: Event, element: any) => create.start(event, shape(elementFactory, type, timer), { source: element }),
    },
  })
  contextPad.registerProvider(500, {
    getContextPadEntries: () => (entries: Record<string, any>) => {
      const kept = Object.fromEntries(Object.entries(entries).filter(([id]) => PAD.has(id)))
      if ("append.end-event" in entries) {
        kept["append.user-task"] = append("bpmn:UserTask", "افزودن کار کاربری", "bpmn-icon-user-task")
        kept["append.service-task"] = append("bpmn:ServiceTask", "افزودن اقدام خودکار", "bpmn-icon-service-task")
        kept["append.parallel-gateway"] = append("bpmn:ParallelGateway", "افزودن دروازه‌ی موازی", "bpmn-icon-gateway-parallel")
        kept["append.timer-event"] = append("bpmn:IntermediateCatchEvent", "افزودن مرحله‌ی زمان‌بندی", "bpmn-icon-intermediate-event-catch-timer", true)
      }
      return kept
    },
  })
}
ContextPadFilter.$inject = ["contextPad", "create", "elementFactory", "autoPlace"]

/** ماژول‌های افزوده به Modeler. */
export const nikyarModules = [
  { translate: ["value", translate] },
  { __init__: ["nikyarPalette", "nikyarContextPad"], nikyarPalette: ["type", PaletteFilter], nikyarContextPad: ["type", ContextPadFilter] },
]

/** رنگ‌ها و قلم بوم از توکن‌های پوسته (با پوسته‌ی روشن و تیره عوض می‌شوند). */
export function themeOptions() {
  const css = getComputedStyle(document.documentElement)
  const token = (name: string) => css.getPropertyValue(name).trim()
  return {
    bpmnRenderer: { defaultFillColor: token("--card"), defaultStrokeColor: token("--foreground"), defaultLabelColor: token("--foreground") },
    textRenderer: { defaultStyle: { fontFamily: token("--font-sans") || "Tahoma", fontSize: 12 }, externalStyle: { fontFamily: token("--font-sans") || "Tahoma", fontSize: 11 } },
  }
}
