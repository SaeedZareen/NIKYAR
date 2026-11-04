import JalaliDate from "./JalaliDate.jsx";
import { toEn, toFa } from "../fa.js";

// فرم پویا بر اساس فیلدهای تعریف‌شده در طراح فرایند
export default function DynamicForm({ fields, values, onChange, errors = {}, readOnly }) {
  const set = (id, v) => onChange({ ...values, [id]: v });
  if (!fields.length) return <p className="muted">این مرحله فرم ورود اطلاعات ندارد.</p>;
  return (
    <div>
      {fields.map((f) => {
        const v = values[f.id];
        const err = errors[f.id];
        const dis = readOnly || f.readonly;
        let control;
        if (f.type === "enum") {
          control = f.options.length <= 3 ? (
            <div className="btn-row">
              {f.options.map((o) => (
                <label key={o.id} className="check" style={{ marginInlineEnd: 16 }}>
                  <input type="radio" name={f.id} checked={v === o.id} disabled={dis}
                    onChange={() => set(f.id, o.id)} /> {o.name}
                </label>
              ))}
            </div>
          ) : (
            <select className={`input ${err ? "invalid" : ""}`} value={v ?? ""} disabled={dis}
              onChange={(e) => set(f.id, e.target.value)}>
              <option value="">انتخاب کنید…</option>
              {f.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          );
        } else if (f.type === "boolean") {
          control = (
            <label className="check">
              <input type="checkbox" checked={!!v} disabled={dis} onChange={(e) => set(f.id, e.target.checked)} />
              {f.label}
            </label>
          );
        } else if (f.type === "date") {
          control = <JalaliDate value={v || ""} onChange={(x) => set(f.id, x)} invalid={!!err} disabled={dis} />;
        } else if (f.type === "long") {
          control = (
            <input className={`input ${err ? "invalid" : ""}`} inputMode="numeric" value={toFa(v ?? "")}
              disabled={dis} style={{ maxWidth: 200 }}
              onChange={(e) => set(f.id, toEn(e.target.value).replace(/[^\d-]/g, ""))} />
          );
        } else if (f.multiline) {
          control = <textarea className={`input ${err ? "invalid" : ""}`} value={v ?? ""} disabled={dis}
            onChange={(e) => set(f.id, e.target.value)} />;
        } else {
          control = <input className={`input ${err ? "invalid" : ""}`} value={v ?? ""} disabled={dis}
            onChange={(e) => set(f.id, e.target.value)} />;
        }
        return (
          <div className="field" key={f.id}>
            {f.type !== "boolean" && <label>{f.label}{f.required && <span className="req">*</span>}</label>}
            {control}
            {f.type === "long" && (f.min != null || f.max != null) && (
              <span className="hint">
                {f.min != null && `حداقل ${toFa(f.min)}`}{f.min != null && f.max != null && " — "}
                {f.max != null && `حداکثر ${toFa(f.max)}`}
              </span>
            )}
            {err && <span className="err">{err}</span>}
          </div>
        );
      })}
    </div>
  );
}
