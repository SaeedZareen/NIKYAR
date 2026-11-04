import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useApp } from "../App.jsx";
import DynamicForm from "../components/DynamicForm.jsx";
import { Loading, Modal, useToast } from "../components/ui.jsx";
import { toFa } from "../fa.js";

export default function TaskPage() {
  const { id } = useParams();
  const { refreshCounts } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [referOpen, setReferOpen] = useState(false);

  useEffect(() => {
    api(`/workflow/inbox/${id}/`).then((t) => {
      setTask(t);
      setValues(Object.fromEntries(t.fields.map((f) => [f.id, f.value ?? (f.type === "boolean" ? false : "")])));
      refreshCounts();
    }).catch((e) => setError(e.message));
  }, [id, refreshCounts]);

  const submit = async () => {
    setBusy(true); setError(""); setErrors({});
    try {
      await api(`/workflow/inbox/${id}/complete/`, { method: "POST", body: { data: values, comment } });
      toast("کار با موفقیت انجام و ارسال شد.");
      refreshCounts();
      navigate("/inbox");
    } catch (e) {
      setError(e.message);
      setErrors(e.fields || {});
    } finally {
      setBusy(false);
    }
  };

  if (error && !task) return <div className="alert alert-error">{error}</div>;
  if (!task) return <Loading />;
  const own = new Set(task.fields.map((f) => f.id));
  const summary = task.summary.filter((s) => !own.has(s.id));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/inbox">کارتابل</Link> / {task.process_name}</div>
          <h1>{task.name}</h1>
          <p>{task.instance_title} · شماره پیگیری <span className="num">{toFa(task.tracking_code)}</span></p>
        </div>
        <Link className="btn" to={`/requests/${task.instance_id}`}>مشاهده‌ی پرونده و سوابق</Link>
      </div>
      <div className="split">
        <div className="card">
          <div className="card-head"><h2>{task.can_act ? "اطلاعات این مرحله" : "اطلاعات ثبت‌شده"}</h2></div>
          <div className="card-body">
            {task.documentation && <div className="alert alert-info">{task.documentation}</div>}
            {error && <div className="alert alert-error">{error}</div>}
            <DynamicForm fields={task.fields} values={values} onChange={setValues} errors={errors} readOnly={!task.can_act} />
            {task.can_act && (
              <>
                <div className="field">
                  <label>یادداشت (اختیاری)</label>
                  <textarea className="input" style={{ minHeight: 64 }} value={comment}
                    onChange={(e) => setComment(e.target.value)} placeholder="این یادداشت در سوابق پرونده ثبت می‌شود" />
                </div>
                <div className="btn-row">
                  <button className="btn btn-primary" onClick={submit} disabled={busy}>
                    {busy ? "در حال ارسال…" : "ثبت و ارسال"}
                  </button>
                  <button className="btn" onClick={() => setReferOpen(true)}>ارجاع به دیگری</button>
                  <Link className="btn btn-ghost" to="/inbox">بازگشت</Link>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>خلاصه‌ی درخواست</h2></div>
          <div className="card-body">
            <dl className="kv">
              <dt>شروع‌کننده</dt><dd>{task.initiator_name}</dd>
              <dt>تاریخ دریافت</dt><dd className="num">{toFa(task.created_at)}</dd>
              {summary.map((s) => (
                <FragmentKV key={s.id} label={s.label} value={s.display} />
              ))}
            </dl>
          </div>
        </div>
      </div>
      {referOpen && <ReferModal itemId={id} onClose={() => setReferOpen(false)} onDone={() => {
        toast("کار ارجاع شد."); refreshCounts(); navigate("/inbox");
      }} />}
    </>
  );
}

function FragmentKV({ label, value }) {
  return <><dt>{label}</dt><dd className="num">{value === null || value === "" ? "—" : toFa(value)}</dd></>;
}

function ReferModal({ itemId, onClose, onDone }) {
  const [users, setUsers] = useState([]);
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const { user } = useApp();
  useEffect(() => { api("/users/").then((u) => setUsers(u.filter((x) => x.id !== user.id && x.is_active))); }, [user.id]);
  const send = async () => {
    try {
      await api(`/workflow/inbox/${itemId}/refer/`, { method: "POST", body: { user_id: target, note } });
      onDone();
    } catch (e) { setError(e.message); }
  };
  return (
    <Modal title="ارجاع کار" onClose={onClose} footer={<>
      <button className="btn btn-primary" disabled={!target} onClick={send}>ارجاع</button>
      <button className="btn" onClick={onClose}>انصراف</button>
    </>}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="field">
        <label>ارجاع به</label>
        <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">انتخاب کاربر…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}{u.positions[0] ? ` — ${u.positions[0].title}` : ""}</option>)}
        </select>
      </div>
      <div className="field">
        <label>توضیح ارجاع</label>
        <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}
