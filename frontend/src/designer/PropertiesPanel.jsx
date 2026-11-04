import { useEffect, useMemo, useState } from "react";
import { TYPE_FA } from "./translate.js";

/*
 * پنل خصوصیات فارسی طراح فرایند.
 * به‌جای پنل انگلیسی استاندارد، فقط تنظیماتی را نشان می‌دهد که یک کارشناس
 * فرایند واقعاً نیاز دارد: نام، انجام‌دهنده، فرم، و شرط مسیرها.
 * خروجی همچنان BPMN استاندارد با پسوندهای camunda است.
 */

const FIELD_TYPES = [
  ["string", "متن"],
  ["long", "عدد"],
  ["date", "تاریخ (شمسی)"],
  ["enum", "انتخاب از فهرست"],
  ["boolean", "بله/خیر (تیک)"],
];

const ASSIGN_MODES = [
  ["initiator", "خودِ درخواست‌دهنده"],
  ["initiator_manager", "مدیر مستقیم درخواست‌دهنده"],
  ["user", "یک کاربر مشخص"],
  ["groups", "سمت / واحد / نقش"],
];

const OPS = [["==", "برابر با"], ["!=", "مخالف"], [">", "بیشتر از"], [">=", "بیشتر یا مساوی"], ["<", "کمتر از"], ["<=", "کمتر یا مساوی"]];

// ---------- خواندن/نوشتن فرم از BPMN ----------
function readForm(bo) {
  const ext = bo.extensionElements?.values || [];
  const fd = ext.find((v) => v.$type === "camunda:FormData");
  return (fd?.fields || []).map((f) => {
    const cons = f.validation?.constraints || [];
    const get = (n) => cons.find((c) => c.name === n);
    return {
      id: f.id || "",
      label: f.label || "",
      type: f.type || "string",
      defaultValue: f.defaultValue || "",
      required: !!get("required"),
      min: get("min")?.config ?? "",
      max: get("max")?.config ?? "",
      multiline: !!(f.properties?.values || []).find((p) => p.id === "multiline" && p.value === "true"),
      options: (f.values || []).map((v) => ({ id: v.id || "", name: v.name || "" })),
    };
  });
}

function writeForm(modeler, element, fields) {
  const moddle = modeler.get("moddle");
  const bo = element.businessObject;
  const others = (bo.extensionElements?.values || []).filter((v) => v.$type !== "camunda:FormData");
  const values = [...others];
  if (fields.length) {
    const fd = moddle.create("camunda:FormData", {
      fields: fields.map((f) => {
        const cons = [];
        if (f.required) cons.push(moddle.create("camunda:Constraint", { name: "required" }));
        if (f.min !== "" && f.min != null) cons.push(moddle.create("camunda:Constraint", { name: "min", config: String(f.min) }));
        if (f.max !== "" && f.max != null) cons.push(moddle.create("camunda:Constraint", { name: "max", config: String(f.max) }));
        const attrs = { id: f.id, label: f.label, type: f.type };
        if (f.defaultValue) attrs.defaultValue = f.defaultValue;
        const ff = moddle.create("camunda:FormField", attrs);
        if (cons.length) ff.validation = moddle.create("camunda:Validation", { constraints: cons });
        if (f.multiline && f.type === "string") {
          ff.properties = moddle.create("camunda:Properties", {
            values: [moddle.create("camunda:Property", { id: "multiline", value: "true" })],
          });
        }
        if (f.type === "enum") ff.values = f.options.map((o) => moddle.create("camunda:Value", o));
        return ff;
      }),
    });
    values.push(fd);
  }
  const ext = values.length ? moddle.create("bpmn:ExtensionElements", { values }) : undefined;
  modeler.get("modeling").updateProperties(element, { extensionElements: ext });
}

// همه‌ی فیلدهای فرم در کل دیاگرام (برای ساخت شرط مسیرها)
function allFields(modeler) {
  const out = [];
  modeler.get("elementRegistry").filter((e) => e.type === "bpmn:UserTask").forEach((e) => {
    readForm(e.businessObject).forEach((f) => out.push({ ...f, task: e.businessObject.name || e.id }));
  });
  return out;
}

const slug = (n) => `field_${n}`;

// ---------- اجزای پنل ----------
export default function PropertiesPanel({ modeler, element, directory }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!modeler) return;
    const bus = modeler.get("eventBus");
    const h = () => force((x) => x + 1);
    bus.on("elements.changed", h);
    return () => bus.off("elements.changed", h);
  }, [modeler]);

  if (!modeler || !element) return null;
  const bo = element.businessObject;
  const type = element.type;
  const isRoot = type === "bpmn:Process" || type === "bpmn:Collaboration";

  return (
    <div className="props">
      <div className="props-head">
        <div className="type">{TYPE_FA[type] || type.replace("bpmn:", "")}</div>
        <h3>{bo.name || (isRoot ? "تنظیمات فرایند" : "بدون عنوان")}</h3>
      </div>
      <div className="props-body" key={element.id}>
        <NameField modeler={modeler} element={element} />
        {type === "bpmn:Task" && <ConvertToUserTask modeler={modeler} element={element} />}
        {type === "bpmn:UserTask" && <>
          <AssignField modeler={modeler} element={element} directory={directory} />
          <DocField modeler={modeler} element={element} />
          <FormBuilder modeler={modeler} element={element} />
        </>}
        {type === "bpmn:SequenceFlow" && bo.sourceRef?.$type?.includes("Gateway") && (
          <ConditionField modeler={modeler} element={element} />
        )}
        {type.includes("Gateway") && (
          <div className="alert alert-info small">
            برای هر مسیر خروجی از این دروازه، روی خودِ پیکان کلیک کنید و «شرط عبور» را تعیین کنید.
          </div>
        )}
        {isRoot && (
          <div className="alert alert-info small">
            برای ساخت فرایند، از نوار ابزار سمت چپ «تسک کاربری» را روی صفحه بکشید. با کلیک روی هر عنصر،
            تنظیمات آن اینجا نمایش داده می‌شود.
          </div>
        )}
        <div className="field">
          <label>شناسه‌ی فنی</label>
          <input className="input input-sm ltr" value={element.id} readOnly />
        </div>
      </div>
    </div>
  );
}

function NameField({ modeler, element }) {
  const bo = element.businessObject;
  const [v, setV] = useState(bo.name || "");
  useEffect(() => setV(bo.name || ""), [bo.name]);
  const isRoot = element.type === "bpmn:Process";
  const commit = () => {
    if ((bo.name || "") === v) return;
    if (isRoot) modeler.get("modeling").updateProperties(element, { name: v });
    else modeler.get("modeling").updateLabel(element, v);
  };
  return (
    <div className="field">
      <label>{isRoot ? "نام فرایند" : "عنوان"}</label>
      <input className="input" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()} />
    </div>
  );
}

function ConvertToUserTask({ modeler, element }) {
  return (
    <div className="alert alert-warning small">
      این یک تسک ساده است و به‌طور خودکار رد می‌شود. اگر باید یک نفر آن را انجام دهد، آن را به «تسک کاربری» تبدیل کنید.
      <div style={{ marginTop: 8 }}>
        <button className="btn btn-sm" onClick={() => {
          const n = modeler.get("bpmnReplace").replaceElement(element, { type: "bpmn:UserTask" });
          modeler.get("selection").select(n);
        }}>تبدیل به تسک کاربری</button>
      </div>
    </div>
  );
}

function DocField({ modeler, element }) {
  const bo = element.businessObject;
  const cur = bo.documentation?.[0]?.text || "";
  const [v, setV] = useState(cur);
  const commit = () => {
    if (v === cur) return;
    const docs = v.trim() ? [modeler.get("moddle").create("bpmn:Documentation", { text: v })] : [];
    modeler.get("modeling").updateProperties(element, { documentation: docs });
  };
  return (
    <div className="field">
      <label>راهنمای انجام کار</label>
      <textarea className="input" style={{ minHeight: 60 }} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit}
        placeholder="این متن بالای فرم به کارپذیر نمایش داده می‌شود" />
    </div>
  );
}

function AssignField({ modeler, element, directory }) {
  const bo = element.businessObject;
  const assignee = bo.get("camunda:assignee") || "";
  const rawGroups = bo.get("camunda:candidateGroups");
  const groups = (rawGroups || "").split(",").map((s) => s.trim()).filter(Boolean);
  const mode = assignee === "initiator" ? "initiator" : assignee === "initiator_manager" ? "initiator_manager"
    : assignee ? "user" : rawGroups !== undefined ? "groups" : "";
  const update = (attrs) => modeler.get("modeling").updateProperties(element, attrs);

  const setMode = (m) => {
    if (m === "initiator" || m === "initiator_manager") update({ "camunda:assignee": m, "camunda:candidateGroups": undefined });
    else if (m === "user") update({ "camunda:assignee": directory.users[0]?.username || "", "camunda:candidateGroups": undefined });
    else update({ "camunda:assignee": undefined, "camunda:candidateGroups": "" });
  };

  const options = useMemo(() => [
    ...directory.positions.map((p) => ({ v: `position:${p.code}`, t: `سمت: ${p.title}` })),
    ...directory.units.map((u) => ({ v: `unit:${u.code}`, t: `واحد: ${u.name}` })),
    ...directory.roles.map((r) => ({ v: `role:${r.name}`, t: `نقش: ${r.name}` })),
  ], [directory]);
  const label = (v) => options.find((o) => o.v === v)?.t || v;
  const [pick, setPick] = useState("");

  return (
    <div className="field">
      <label>انجام‌دهنده<span className="req">*</span></label>
      <select className={`input ${!mode ? "invalid" : ""}`} value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="" disabled>تعیین کنید…</option>
        {ASSIGN_MODES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
      {mode === "user" && (
        <select className="input" value={assignee} onChange={(e) => update({ "camunda:assignee": e.target.value })}>
          {directory.users.map((u) => <option key={u.id} value={u.username}>{u.full_name}</option>)}
        </select>
      )}
      {mode === "groups" && (
        <>
          <div className="btn-row" style={{ flexWrap: "nowrap" }}>
            <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">افزودن…</option>
              {options.filter((o) => !groups.includes(o.v)).map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
            </select>
            <button className="btn btn-sm" disabled={!pick} onClick={() => {
              update({ "camunda:candidateGroups": [...groups, pick].join(",") }); setPick("");
            }}>افزودن</button>
          </div>
          <div className="chips">
            {groups.map((g) => (
              <span className="chip" key={g}>{label(g)}
                <button onClick={() => update({ "camunda:candidateGroups": groups.filter((x) => x !== g).join(",") })} aria-label="حذف">×</button>
              </span>
            ))}
          </div>
          <span className="hint">هر کدام از افراد این گروه‌ها می‌توانند کار را انجام دهند.</span>
        </>
      )}
    </div>
  );
}

function FormBuilder({ modeler, element }) {
  const [fields, setFields] = useState(() => readForm(element.businessObject));
  const [openIdx, setOpenIdx] = useState(null);
  const save = (next) => { setFields(next); writeForm(modeler, element, next); };
  const upd = (i, patch) => save(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const add = () => {
    const used = new Set(allFields(modeler).map((f) => f.id));
    let n = 1;
    while (used.has(slug(n))) n += 1;
    save([...fields, { id: slug(n), label: "فیلد جدید", type: "string", defaultValue: "", required: false, min: "", max: "", multiline: false, options: [] }]);
    setOpenIdx(fields.length);
  };
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };

  return (
    <div className="field">
      <label>فرم این مرحله</label>
      {fields.length === 0 && <span className="hint">هنوز فیلدی تعریف نشده است.</span>}
      {fields.map((f, i) => (
        <div className="form-field-item" key={i}>
          <div className="row">
            <b style={{ flex: 1, cursor: "pointer" }} onClick={() => setOpenIdx(openIdx === i ? null : i)}>
              {f.label || "بدون عنوان"} {f.required && <span className="req">*</span>}
              <span className="small muted"> · {FIELD_TYPES.find((t) => t[0] === f.type)?.[1]}</span>
            </b>
            <button className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} title="بالا">▲</button>
            <button className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} title="پایین">▼</button>
          </div>
          {openIdx === i && (
            <div style={{ marginTop: 10 }}>
              <div className="field"><label>عنوان فیلد</label>
                <input className="input input-sm" value={f.label} onChange={(e) => setFields(fields.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                  onBlur={() => save(fields)} /></div>
              <div className="field"><label>نوع</label>
                <select className="input input-sm" value={f.type} onChange={(e) => upd(i, { type: e.target.value })}>
                  {FIELD_TYPES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select></div>
              <div className="field"><label>شناسه‌ی فنی (لاتین)</label>
                <input className="input input-sm ltr" value={f.id}
                  onChange={(e) => setFields(fields.map((x, j) => j === i ? { ...x, id: e.target.value.replace(/[^A-Za-z0-9_]/g, "") } : x))}
                  onBlur={() => save(fields)} />
                <span className="hint">در شرط مسیرها از این نام استفاده می‌شود.</span></div>
              {f.type === "enum" && (
                <div className="field"><label>گزینه‌ها</label>
                  {f.options.map((o, k) => (
                    <div className="opt-row" key={k}>
                      <input className="input input-sm" placeholder="عنوان" value={o.name}
                        onChange={(e) => setFields(fields.map((x, j) => j === i ? { ...x, options: x.options.map((y, m) => m === k ? { ...y, name: e.target.value } : y) } : x))}
                        onBlur={() => save(fields)} />
                      <input className="input input-sm ltr" style={{ width: 90 }} placeholder="کد" value={o.id}
                        onChange={(e) => setFields(fields.map((x, j) => j === i ? { ...x, options: x.options.map((y, m) => m === k ? { ...y, id: e.target.value.replace(/[^A-Za-z0-9_]/g, "") } : y) } : x))}
                        onBlur={() => save(fields)} />
                      <button className="btn btn-ghost btn-sm" onClick={() => upd(i, { options: f.options.filter((_, m) => m !== k) })}>×</button>
                    </div>
                  ))}
                  <button className="btn btn-sm" onClick={() => upd(i, { options: [...f.options, { id: `opt${f.options.length + 1}`, name: "" }] })}>+ گزینه</button>
                </div>
              )}
              {f.type === "long" && (
                <div className="row" style={{ marginBottom: 12 }}>
                  <input className="input input-sm" placeholder="حداقل" value={f.min} onChange={(e) => upd(i, { min: e.target.value.replace(/[^\d]/g, "") })} />
                  <input className="input input-sm" placeholder="حداکثر" value={f.max} onChange={(e) => upd(i, { max: e.target.value.replace(/[^\d]/g, "") })} />
                </div>
              )}
              {f.type === "string" && (
                <label className="check small" style={{ marginBottom: 8 }}>
                  <input type="checkbox" checked={f.multiline} onChange={(e) => upd(i, { multiline: e.target.checked })} /> متن چندخطی
                </label>
              )}
              <label className="check small" style={{ marginBottom: 10 }}>
                <input type="checkbox" checked={f.required} onChange={(e) => upd(i, { required: e.target.checked })} /> الزامی
              </label>
              <button className="btn btn-danger btn-sm" onClick={() => { save(fields.filter((_, j) => j !== i)); setOpenIdx(null); }}>حذف فیلد</button>
            </div>
          )}
        </div>
      ))}
      <button className="btn btn-sm" onClick={add}>+ افزودن فیلد</button>
    </div>
  );
}

function ConditionField({ modeler, element }) {
  const bo = element.businessObject;
  const cur = bo.conditionExpression?.body || "";
  const fields = useMemo(() => allFields(modeler), [modeler]);
  const m = /^\s*(\w+)\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*$/.exec(cur);
  const parsed = m ? { field: m[1], op: m[2], value: m[3].replace(/^["']|["']$/g, "") } : null;
  const [advanced, setAdvanced] = useState(!!cur && !parsed);
  const [raw, setRaw] = useState(cur);

  const write = (expr) => {
    const moddle = modeler.get("moddle");
    modeler.get("modeling").updateProperties(element, {
      conditionExpression: expr ? moddle.create("bpmn:FormalExpression", { body: expr }) : undefined,
    });
    setRaw(expr);
  };
  const build = (p) => {
    const f = fields.find((x) => x.id === p.field);
    if (!f) return write("");
    let val = p.value ?? "";
    if (f.type === "long") val = String(parseInt(val || "0", 10));
    else if (f.type === "boolean") val = val === "True" ? "True" : "False";
    else val = JSON.stringify(val);
    write(`${p.field} ${p.op} ${val}`);
  };
  const state = parsed || { field: "", op: "==", value: "" };
  const field = fields.find((f) => f.id === state.field);

  return (
    <div className="field">
      <label>شرط عبور از این مسیر</label>
      {!advanced ? (
        <>
          <select className="input input-sm" value={state.field} onChange={(e) => {
            const f = fields.find((x) => x.id === e.target.value);
            build({ field: e.target.value, op: "==", value: f?.type === "enum" ? f.options[0]?.id : f?.type === "boolean" ? "True" : "" });
          }}>
            <option value="">بدون شرط</option>
            {fields.map((f) => <option key={f.id} value={f.id}>{f.label} ({f.task})</option>)}
          </select>
          {field && (
            <>
              <select className="input input-sm" value={state.op} onChange={(e) => build({ ...state, op: e.target.value })}>
                {(field.type === "long" ? OPS : OPS.slice(0, 2)).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
              {field.type === "enum" ? (
                <select className="input input-sm" value={state.value} onChange={(e) => build({ ...state, value: e.target.value })}>
                  {field.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              ) : field.type === "boolean" ? (
                <select className="input input-sm" value={state.value} onChange={(e) => build({ ...state, value: e.target.value })}>
                  <option value="True">بله</option><option value="False">خیر</option>
                </select>
              ) : (
                <input className="input input-sm" defaultValue={state.value} onBlur={(e) => build({ ...state, value: e.target.value })} />
              )}
            </>
          )}
        </>
      ) : (
        <input className="input input-sm ltr" value={raw} onChange={(e) => setRaw(e.target.value)} onBlur={() => write(raw.trim())}
          placeholder='days > 3 and leave_type == "estelaji"' />
      )}
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setAdvanced(!advanced)}>
        {advanced ? "حالت ساده" : "حالت پیشرفته (عبارت دلخواه)"}
      </button>
      {raw && <span className="hint ltr">{raw}</span>}
    </div>
  );
}
