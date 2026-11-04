import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { Loading, Modal, useToast } from "../components/ui.jsx";
import { toFa } from "../fa.js";

export default function Organization() {
  const [tab, setTab] = useState("chart");
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null); // {kind, item}
  const toast = useToast();

  const load = useCallback(() => {
    Promise.all([api("/users/"), api("/org/units/"), api("/roles/")])
      .then(([users, units, roles]) => setData({ users, units, roles }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const done = (msg) => { setEdit(null); toast(msg); load(); };
  if (!data) return <Loading />;

  const children = (pid) => data.units.filter((u) => (u.parent ?? null) === pid);
  const renderUnit = (u, depth) => (
    <div key={u.id} style={{ marginInlineStart: depth * 24, marginBottom: 12 }}>
      <div className="card">
        <div className="card-head">
          <div><h3>{u.name}</h3><span className="small muted ltr">{u.code}</span></div>
          <div className="btn-row">
            <button className="btn btn-sm" onClick={() => setEdit({ kind: "position", item: { org_unit: u.id } })}>+ سمت</button>
            <button className="btn btn-sm" onClick={() => setEdit({ kind: "unit", item: { parent: u.id } })}>+ زیرواحد</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ kind: "unit", item: u })}>ویرایش</button>
          </div>
        </div>
        {u.positions.length > 0 && (
          <table className="table"><tbody>
            {u.positions.map((p) => (
              <tr key={p.id} className="clickable" onClick={() => setEdit({ kind: "position", item: p })}>
                <td style={{ width: "40%" }}>{p.title} {p.is_manager && <span className="badge">مدیر واحد</span>}</td>
                <td>{p.holder_name || <span className="muted">بدون متصدی</span>}</td>
                <td className="small muted ltr">{p.code}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>
      {children(u.id).map((c) => renderUnit(c, depth + 1))}
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div><h1>کاربران و چارت سازمانی</h1><p>انتساب کارها در فرایندها بر اساس همین ساختار انجام می‌شود.</p></div>
        <div className="btn-row">
          {tab === "users"
            ? <button className="btn btn-primary" onClick={() => setEdit({ kind: "user", item: { is_active: true } })}>+ کاربر جدید</button>
            : <button className="btn btn-primary" onClick={() => setEdit({ kind: "unit", item: {} })}>+ واحد جدید</button>}
        </div>
      </div>
      <div className="tabs">
        <button className={tab === "chart" ? "active" : ""} onClick={() => setTab("chart")}>چارت سازمانی</button>
        <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>کاربران ({toFa(data.users.length)})</button>
      </div>
      {tab === "chart" ? children(null).map((u) => renderUnit(u, 0)) : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>نام و نام خانوادگی</th><th>نام کاربری</th><th>کد پرسنلی</th><th>سمت</th><th>وضعیت</th></tr></thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className="clickable" onClick={() => setEdit({ kind: "user", item: u })}>
                  <td>{u.full_name} {u.is_staff && <span className="badge">مدیر سامانه</span>}</td>
                  <td className="ltr" style={{ textAlign: "right" }}>{u.username}</td>
                  <td className="num">{toFa(u.personnel_code) || "—"}</td>
                  <td className="small">{u.positions.map((p) => `${p.title} (${p.org_unit})`).join("، ") || "—"}</td>
                  <td>{u.is_active ? <span className="badge badge-green">فعال</span> : <span className="badge badge-gray">غیرفعال</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit?.kind === "user" && <UserModal item={edit.item} roles={data.roles} onClose={() => setEdit(null)} onDone={() => done("کاربر ذخیره شد.")} />}
      {edit?.kind === "unit" && <UnitModal item={edit.item} units={data.units} onClose={() => setEdit(null)} onDone={() => done("واحد ذخیره شد.")} />}
      {edit?.kind === "position" && <PositionModal item={edit.item} units={data.units} users={data.users} onClose={() => setEdit(null)} onDone={() => done("سمت ذخیره شد.")} />}
    </>
  );
}

function useSave(path, item, onDone) {
  const [error, setError] = useState("");
  const save = async (body) => {
    try {
      await api(item.id ? `${path}${item.id}/` : path, { method: item.id ? "PATCH" : "POST", body });
      onDone();
    } catch (e) { setError(e.message); }
  };
  return [save, error];
}

function Foot({ onSave, onClose }) {
  return <><button className="btn btn-primary" onClick={onSave}>ذخیره</button><button className="btn" onClick={onClose}>انصراف</button></>;
}

function UserModal({ item, roles, onClose, onDone }) {
  const [f, setF] = useState({ username: "", first_name: "", last_name: "", personnel_code: "", mobile: "",
    password: "", is_staff: false, is_active: true, roles: [], ...item });
  const [save, error] = useSave("/users/", item, onDone);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const body = () => {
    const { positions, full_name, id, ...rest } = f;
    if (!rest.password) delete rest.password;
    return rest;
  };
  return (
    <Modal title={item.id ? "ویرایش کاربر" : "کاربر جدید"} onClose={onClose} footer={<Foot onSave={() => save(body())} onClose={onClose} />}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="grid grid-2" style={{ gap: "0 12px" }}>
        <div className="field"><label>نام</label><input className="input" value={f.first_name} onChange={set("first_name")} /></div>
        <div className="field"><label>نام خانوادگی</label><input className="input" value={f.last_name} onChange={set("last_name")} /></div>
        <div className="field"><label>نام کاربری<span className="req">*</span></label><input className="input ltr" value={f.username} onChange={set("username")} /></div>
        <div className="field"><label>{item.id ? "رمز عبور جدید" : "رمز عبور"}</label><input className="input ltr" type="password" value={f.password} onChange={set("password")} placeholder={item.id ? "خالی = بدون تغییر" : ""} /></div>
        <div className="field"><label>کد پرسنلی</label><input className="input ltr" value={f.personnel_code} onChange={set("personnel_code")} /></div>
        <div className="field"><label>تلفن همراه</label><input className="input ltr" value={f.mobile} onChange={set("mobile")} /></div>
      </div>
      {roles.length > 0 && (
        <div className="field"><label>نقش‌ها</label>
          <div className="btn-row">
            {roles.map((r) => (
              <label key={r.id} className="check small">
                <input type="checkbox" checked={f.roles.includes(r.name)}
                  onChange={(e) => setF({ ...f, roles: e.target.checked ? [...f.roles, r.name] : f.roles.filter((x) => x !== r.name) })} />
                {r.name}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="btn-row">
        <label className="check"><input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> فعال</label>
        <label className="check"><input type="checkbox" checked={f.is_staff} onChange={set("is_staff")} /> مدیر سامانه</label>
      </div>
    </Modal>
  );
}

function UnitModal({ item, units, onClose, onDone }) {
  const [f, setF] = useState({ name: "", code: "", parent: null, ...item });
  const [save, error] = useSave("/org/units/", item, onDone);
  return (
    <Modal title={item.id ? "ویرایش واحد" : "واحد جدید"} onClose={onClose}
      footer={<Foot onSave={() => save({ name: f.name, code: f.code, parent: f.parent || null })} onClose={onClose} />}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="field"><label>نام واحد<span className="req">*</span></label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="field"><label>کد لاتین<span className="req">*</span></label><input className="input ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} /></div>
      <div className="field"><label>واحد بالادستی</label>
        <select className="input" value={f.parent || ""} onChange={(e) => setF({ ...f, parent: e.target.value ? +e.target.value : null })}>
          <option value="">— (بالاترین سطح)</option>
          {units.filter((u) => u.id !== item.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select></div>
    </Modal>
  );
}

function PositionModal({ item, units, users, onClose, onDone }) {
  const [f, setF] = useState({ title: "", code: "", holder: null, is_manager: false, ...item });
  const [save, error] = useSave("/org/positions/", item, onDone);
  return (
    <Modal title={item.id ? "ویرایش سمت" : "سمت جدید"} onClose={onClose}
      footer={<Foot onSave={() => save({ title: f.title, code: f.code, org_unit: f.org_unit, holder: f.holder || null, is_manager: f.is_manager })} onClose={onClose} />}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="field"><label>عنوان سمت<span className="req">*</span></label><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      <div className="field"><label>کد لاتین<span className="req">*</span></label><input className="input ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} />
        <span className="hint">در طراح فرایند برای انتساب کار به این سمت استفاده می‌شود.</span></div>
      <div className="field"><label>واحد</label>
        <select className="input" value={f.org_unit} onChange={(e) => setF({ ...f, org_unit: +e.target.value })}>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select></div>
      <div className="field"><label>متصدی</label>
        <select className="input" value={f.holder || ""} onChange={(e) => setF({ ...f, holder: e.target.value ? +e.target.value : null })}>
          <option value="">— بدون متصدی</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select></div>
      <label className="check"><input type="checkbox" checked={f.is_manager} onChange={(e) => setF({ ...f, is_manager: e.target.checked })} /> مدیر این واحد است</label>
    </Modal>
  );
}
