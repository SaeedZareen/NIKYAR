import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Modeler from "bpmn-js/lib/Modeler";
import camundaModdle from "camunda-bpmn-moddle/resources/camunda.json";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";
import { api } from "../api.js";
import { Loading, Modal, useToast } from "../components/ui.jsx";
import PropertiesPanel from "../designer/PropertiesPanel.jsx";
import translateModule from "../designer/translate.js";
import userTaskPalette from "../designer/userTaskPalette.js";
import { toFa } from "../fa.js";

export default function ProcessDesigner() {
  const { id } = useParams();
  const toast = useToast();
  const canvasRef = useRef(null);
  const [modeler, setModeler] = useState(null);
  const [model, setModel] = useState(null);
  const [selected, setSelected] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [directory, setDirectory] = useState({ users: [], positions: [], units: [], roles: [] });

  useEffect(() => {
    Promise.all([api("/users/"), api("/org/positions/"), api("/org/units/"), api("/roles/")])
      .then(([users, positions, units, roles]) => setDirectory({ users, positions, units, roles }));
  }, []);

  useEffect(() => {
    const m = new Modeler({
      container: canvasRef.current,
      moddleExtensions: { camunda: camundaModdle },
      additionalModules: [translateModule, userTaskPalette],
      keyboard: { bindTo: document },
    });
    const root = () => m.get("canvas").getRootElement();
    m.on("selection.changed", ({ newSelection }) => {
      const el = newSelection[0];
      setSelected(el ? el.labelTarget || el : root());
    });
    m.on("commandStack.changed", () => setDirty(true));
    setModeler(m);
    api(`/workflow/process-models/${id}/`).then(async (pm) => {
      setModel(pm);
      await m.importXML(pm.draft_xml);
      m.get("canvas").zoom("fit-viewport", "auto");
      if (m.get("canvas").zoom() > 1) m.get("canvas").zoom(1);
      m.get("canvas").scroll({ dx: 110, dy: 0 }); // فضا برای نوار ابزار
      setSelected(root());
      setDirty(false);
    }).catch((e) => setProblem(e.message));
    return () => m.destroy();
  }, [id]);

  const save = useCallback(async () => {
    const { xml } = await modeler.saveXML({ format: true });
    const pm = await api(`/workflow/process-models/${id}/`, { method: "PATCH", body: { draft_xml: xml } });
    setModel(pm);
    setDirty(false);
    return xml;
  }, [modeler, id]);

  const run = async (fn) => {
    setBusy(true); setProblem("");
    try { await fn(); } catch (e) { setProblem(e.message); } finally { setBusy(false); }
  };

  const onSave = () => run(async () => { await save(); toast("پیش‌نویس ذخیره شد."); });
  const onValidate = () => run(async () => {
    const xml = await save();
    const r = await api(`/workflow/process-models/${id}/validate/`, { method: "POST", body: { xml } });
    toast(r.detail);
  });
  const onPublish = () => run(async () => {
    await save();
    const r = await api(`/workflow/process-models/${id}/publish/`, { method: "POST" });
    toast(r.detail);
    setModel(await api(`/workflow/process-models/${id}/`));
  });
  const onExport = async () => {
    const { xml } = await modeler.saveXML({ format: true });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
    a.download = `${model.key}.bpmn`;
    a.click();
  };

  // هشدار هنگام ترک صفحه با تغییرات ذخیره‌نشده
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/processes">طراحی فرایندها</Link></div>
          <h1>{model?.name || "…"}</h1>
          <p>
            {model?.latest_version ? <>آخرین نسخه‌ی منتشرشده: <span className="num">{toFa(model.latest_version.version)}</span> ({toFa(model.latest_version.published_at)})</> : "هنوز منتشر نشده"}
            {dirty ? " · تغییرات ذخیره‌نشده" : model?.has_unpublished_changes && model?.latest_version ? " · تغییرات منتشرنشده دارد" : ""}
          </p>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => setSettingsOpen(true)} disabled={!model}>مشخصات</button>
          <button className="btn" onClick={onExport} disabled={!model}>دریافت فایل BPMN</button>
          <button className="btn" onClick={onValidate} disabled={busy || !model}>بررسی صحت</button>
          <button className="btn" onClick={onSave} disabled={busy || !model}>ذخیره‌ی پیش‌نویس</button>
          <button className="btn btn-accent" onClick={onPublish} disabled={busy || !model}>انتشار</button>
        </div>
      </div>
      {problem && <div className="alert alert-error">{problem}</div>}
      <div className="designer">
        <div className="canvas" ref={canvasRef}>{!model && !problem && <Loading />}</div>
        <PropertiesPanel modeler={modeler} element={selected} directory={directory} />
      </div>
      {settingsOpen && <SettingsModal model={model} onClose={() => setSettingsOpen(false)}
        onSaved={(pm) => { setModel(pm); setSettingsOpen(false); toast("مشخصات ذخیره شد."); }} directory={directory} />}
    </>
  );
}

export function SettingsModal({ model, onClose, onSaved, isNew }) {
  const [f, setF] = useState({
    key: model?.key || "", name: model?.name || "", category: model?.category || "",
    description: model?.description || "", is_active: model?.is_active ?? true,
  });
  const [error, setError] = useState("");
  const save = async () => {
    try {
      const pm = isNew
        ? await api("/workflow/process-models/", { method: "POST", body: f })
        : await api(`/workflow/process-models/${model.id}/`, { method: "PATCH", body: f });
      onSaved(pm);
    } catch (e) { setError(e.message); }
  };
  return (
    <Modal title={isNew ? "فرایند جدید" : "مشخصات فرایند"} onClose={onClose} footer={<>
      <button className="btn btn-primary" onClick={save} disabled={!f.name || !f.key}>{isNew ? "ایجاد و ورود به طراح" : "ذخیره"}</button>
      <button className="btn" onClick={onClose}>انصراف</button>
    </>}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="field"><label>نام فرایند<span className="req">*</span></label>
        <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="مثلاً: درخواست خرید کالا" /></div>
      <div className="field"><label>کلید لاتین<span className="req">*</span></label>
        <input className="input ltr" value={f.key} disabled={!isNew} placeholder="purchase_request"
          onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} />
        <span className="hint">شناسه‌ی یکتا و غیرقابل تغییر فرایند</span></div>
      <div className="field"><label>دسته‌بندی</label>
        <input className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="مثلاً: امور اداری، مالی، پشتیبانی" /></div>
      <div className="field"><label>توضیحات</label>
        <textarea className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> فعال (قابل شروع توسط کاربران)</label>
    </Modal>
  );
}
