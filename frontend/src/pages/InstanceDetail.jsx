import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import DiagramViewer from "../components/DiagramViewer.jsx";
import { Loading, Modal, StatusBadge, useToast } from "../components/ui.jsx";
import { toFa } from "../fa.js";

export default function InstanceDetail() {
  const { id } = useParams();
  const [inst, setInst] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("history");
  const [note, setNote] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const toast = useToast();

  const load = useCallback(() => api(`/workflow/instances/${id}/`).then(setInst).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const addNote = async () => {
    try {
      await api(`/workflow/instances/${id}/comment/`, { method: "POST", body: { text: note } });
      setNote(""); load();
    } catch (e) { toast(e.message, "error"); }
  };

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!inst) return <Loading />;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/requests">پیگیری درخواست‌ها</Link> / {inst.process_name}</div>
          <h1>{inst.title}</h1>
          <p>شماره پیگیری <span className="num">{toFa(inst.tracking_code)}</span> · <StatusBadge status={inst.status} label={inst.status_display} /></p>
        </div>
        {inst.can_cancel && <button className="btn btn-danger" onClick={() => setCancelOpen(true)}>لغو درخواست</button>}
      </div>
      <div className="split">
        <div className="card">
          <div className="card-head">
            <h2>نقشه‌ی فرایند</h2>
            <span className="small muted">
              <span className="badge badge-amber">مرحله‌ی جاری</span> <span className="badge badge-green">انجام‌شده</span>
            </span>
          </div>
          <DiagramViewer xml={inst.xml} active={inst.active_elements} done={inst.completed_elements} />
        </div>
        <div className="card">
          <div className="card-head"><h2>مشخصات درخواست</h2></div>
          <div className="card-body">
            <dl className="kv">
              <dt>شروع‌کننده</dt><dd>{inst.initiator_name}</dd>
              <dt>تاریخ ثبت</dt><dd className="num">{toFa(inst.started_at)}</dd>
              {inst.ended_at && <><dt>تاریخ خاتمه</dt><dd className="num">{toFa(inst.ended_at)}</dd></>}
              <dt>نسخه‌ی فرایند</dt><dd className="num">{toFa(inst.version)}</dd>
              {inst.summary.map((s) => (
                <span key={s.id} style={{ display: "contents" }}>
                  <dt>{s.label}</dt><dd className="num">{s.display === null || s.display === "" ? "—" : toFa(s.display)}</dd>
                </span>
              ))}
            </dl>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-body">
          <div className="tabs">
            <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>سوابق پرونده</button>
            <button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>مراحل و کارپذیران</button>
          </div>
          {tab === "history" ? (
            <>
              <ul className="timeline">
                {inst.events.map((e) => (
                  <li key={e.id} className={`k-${e.kind}`}>
                    <div className="when num">{toFa(e.at)} · {e.kind_display}</div>
                    <div className="msg">{e.message}</div>
                  </li>
                ))}
              </ul>
              <div className="btn-row" style={{ marginTop: 8 }}>
                <input className="input" style={{ maxWidth: 480 }} placeholder="افزودن یادداشت به پرونده…" value={note}
                  onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && note && addNote()} />
                <button className="btn" disabled={!note.trim()} onClick={addNote}>ثبت یادداشت</button>
              </div>
            </>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>مرحله</th><th>کارپذیر</th><th>تاریخ دریافت</th><th>انجام‌دهنده</th><th>تاریخ انجام</th><th>وضعیت</th></tr></thead>
                <tbody>
                  {inst.work_items.map((w) => (
                    <tr key={w.id}>
                      <td>{w.name}</td><td className="small">{w.candidates.join("، ")}</td>
                      <td className="num small">{toFa(w.created_at)}</td><td>{w.completed_by || "—"}</td>
                      <td className="num small">{toFa(w.completed_at) || "—"}</td>
                      <td><StatusBadge status={w.status} label={w.status_display} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {cancelOpen && <CancelModal id={id} onClose={() => setCancelOpen(false)} onDone={() => { setCancelOpen(false); toast("درخواست لغو شد."); load(); }} />}
    </>
  );
}

function CancelModal({ id, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const go = async () => {
    try { await api(`/workflow/instances/${id}/cancel/`, { method: "POST", body: { reason } }); onDone(); }
    catch (e) { setError(e.message); }
  };
  return (
    <Modal title="لغو درخواست" onClose={onClose} footer={<>
      <button className="btn btn-danger" onClick={go}>تأیید لغو</button>
      <button className="btn" onClick={onClose}>انصراف</button>
    </>}>
      {error && <div className="alert alert-error">{error}</div>}
      <p>با لغو درخواست، همه‌ی کارهای باز آن از کارتابل‌ها حذف می‌شود. این عمل قابل بازگشت نیست.</p>
      <div className="field"><label>علت لغو</label>
        <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
    </Modal>
  );
}
