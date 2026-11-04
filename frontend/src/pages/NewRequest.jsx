import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useApp } from "../App.jsx";
import { Empty, Loading, useToast } from "../components/ui.jsx";
import { toFa } from "../fa.js";

export default function NewRequest() {
  const [models, setModels] = useState(null);
  const [busy, setBusy] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();
  const { refreshCounts } = useApp();

  useEffect(() => { api("/workflow/process-models/startable/").then(setModels).catch(() => setModels([])); }, []);

  const start = async (m) => {
    setBusy(m.id);
    try {
      const r = await api(`/workflow/process-models/${m.id}/start/`, { method: "POST", body: {} });
      refreshCounts();
      toast(`درخواست با شماره‌ی ${toFa(r.tracking_code)} ایجاد شد.`);
      navigate(r.work_item_id ? `/tasks/${r.work_item_id}` : `/requests/${r.instance_id}`);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const groups = {};
  (models || []).forEach((m) => { (groups[m.category || "سایر"] ||= []).push(m); });

  return (
    <>
      <div className="page-head">
        <div><h1>ثبت درخواست جدید</h1><p>نوع درخواست موردنظر خود را انتخاب کنید.</p></div>
      </div>
      {models === null ? <Loading /> : models.length === 0 ? (
        <div className="card"><Empty title="فرایند فعالی برای شما تعریف نشده است">با مدیر سامانه تماس بگیرید.</Empty></div>
      ) : Object.entries(groups).map(([cat, list]) => (
        <section key={cat} style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 12 }}>{cat}</h2>
          <div className="grid grid-3">
            {list.map((m) => (
              <div className="card process-card" key={m.id}>
                <h3>{m.name}</h3>
                <p>{m.description || "—"}</p>
                <button className="btn btn-primary" onClick={() => start(m)} disabled={busy === m.id}>
                  {busy === m.id ? "در حال ایجاد…" : "شروع درخواست"}
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
