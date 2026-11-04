import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, auth } from "../api.js";
import { useApp } from "../App.jsx";

export default function Login() {
  const { onLogin } = useApp();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api("/auth/login/", { method: "POST", body: form });
      auth.token = r.token;
      await onLogin();
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-side">
        <div>
          <h1>نیک‌یار</h1>
          <p>سامانه‌ی یکپارچه‌ی مدیریت فرایندهای سازمانی</p>
        </div>
        <ul>
          <li>طراحی فرایندها با استاندارد بین‌المللی BPMN</li>
          <li>کارتابل اداری، ارجاع و پیگیری درخواست‌ها</li>
          <li>ساختار ماژولار و قابل توسعه به ERP</li>
        </ul>
        <small style={{ color: "#8da2ba" }}>© نیک‌یار</small>
      </div>
      <div className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <h2>ورود به سامانه</h2>
          <p className="muted" style={{ marginTop: 0, marginBottom: 24 }}>نام کاربری و رمز عبور خود را وارد کنید.</p>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="field">
            <label htmlFor="u">نام کاربری</label>
            <input id="u" className="input ltr" autoFocus value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="p">رمز عبور</label>
            <input id="p" type="password" className="input ltr" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <button className="btn btn-primary" style={{ width: "100%", height: 40 }} disabled={busy}>
            {busy ? "در حال ورود…" : "ورود"}
          </button>
          <div className="demo-hint">
            <b>کاربران نمایشی</b> (رمز همه: <span className="ltr">nikyar123</span>)<br />
            admin (مدیر سامانه) · developer (کارمند) · it_manager (مدیر) · hr_expert (امور اداری)
          </div>
        </form>
      </div>
    </div>
  );
}
