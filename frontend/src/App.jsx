import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, auth } from "./api.js";
import Icon from "./components/Icon.jsx";
import { Loading, ToastProvider } from "./components/ui.jsx";
import { longDate, toFa } from "./fa.js";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Inbox from "./pages/Inbox.jsx";
import TaskPage from "./pages/TaskPage.jsx";
import NewRequest from "./pages/NewRequest.jsx";
import Instances from "./pages/Instances.jsx";
import InstanceDetail from "./pages/InstanceDetail.jsx";
import ProcessList from "./pages/ProcessList.jsx";
import ProcessDesigner from "./pages/ProcessDesigner.jsx";
import Organization from "./pages/Organization.jsx";
import Modules from "./pages/Modules.jsx";

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

// ماژول‌های آینده‌ی ERP — فعلاً فقط در منو نمایش داده می‌شوند
const FUTURE = [
  { code: "inventory", title: "انبار و کالا", icon: "box" },
  { code: "accounting", title: "حسابداری", icon: "cash" },
  { code: "hr", title: "منابع انسانی و حقوق", icon: "card" },
];

function Layout({ children }) {
  const { user, counts, modules, logout } = useApp();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const enabled = new Set((modules?.modules || []).filter((m) => m.enabled).map((m) => m.code));
  const initials = (user.first_name?.[0] || user.username[0]) + (user.last_name?.[0] || "");

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-name">نیک‌یار</div>
          <div className="brand-sub">سامانه‌ی یکپارچه‌ی مدیریت فرایند</div>
        </div>
        <nav className="nav">
          <NavLink to="/" end><Icon name="home" /> پیشخوان</NavLink>
          {enabled.has("workflow") && <>
            <div className="nav-section">گردش کار</div>
            <NavLink to="/inbox"><Icon name="inbox" /> کارتابل
              {counts.open > 0 && <span className="badge">{toFa(counts.open)}</span>}
            </NavLink>
            <NavLink to="/new"><Icon name="plus" /> ثبت درخواست جدید</NavLink>
            <NavLink to="/requests"><Icon name="search" /> پیگیری درخواست‌ها</NavLink>
            <NavLink to="/inbox/done"><Icon name="done" /> کارهای انجام‌شده</NavLink>
          </>}
          {user.is_staff && <>
            <div className="nav-section">مدیریت سامانه</div>
            <NavLink to="/processes"><Icon name="flow" /> طراحی فرایندها</NavLink>
            <NavLink to="/organization"><Icon name="users" /> کاربران و چارت سازمانی</NavLink>
            <NavLink to="/modules"><Icon name="puzzle" /> ماژول‌ها و لایسنس</NavLink>
          </>}
          <div className="nav-section">ماژول‌های تکمیلی</div>
          {FUTURE.map((m) => (
            <a key={m.code} className="disabled" href="#"><Icon name={m.icon} /> {m.title}<span className="soon">به‌زودی</span></a>
          ))}
        </nav>
        <div className="sidebar-foot">{modules?.customer} · نسخه‌ی ۰٫۱</div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-sm menu-btn" onClick={() => setOpen(!open)} aria-label="منو">
            <Icon name="menu" />
          </button>
          <span className="date">{longDate()}</span>
          <span className="spacer" />
          <div className="user-chip">
            <div className="avatar">{initials}</div>
            <div className="who">
              {user.full_name}
              <small>{user.positions?.[0]?.title || (user.is_staff ? "مدیر سامانه" : "")}</small>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={logout} title="خروج"><Icon name="logout" /></button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [modules, setModules] = useState(null);
  const [counts, setCounts] = useState({ open: 0, unread: 0 });
  const navigate = useNavigate();

  const refreshCounts = useCallback(() => {
    api("/workflow/inbox/counts/").then(setCounts).catch(() => {});
  }, []);

  const loadSession = useCallback(async () => {
    if (!auth.token) return setUser(null);
    try {
      const [me, mods] = await Promise.all([api("/auth/me/"), api("/modules/")]);
      setUser(me);
      setModules(mods);
      refreshCounts();
    } catch {
      setUser(null);
    }
  }, [refreshCounts]);

  useEffect(() => { loadSession(); }, [loadSession]);
  useEffect(() => {
    if (!user) return;
    const h = setInterval(refreshCounts, 30000);
    return () => clearInterval(h);
  }, [user, refreshCounts]);

  const logout = async () => {
    try { await api("/auth/logout/", { method: "POST" }); } catch { /* */ }
    auth.token = null;
    setUser(null);
    navigate("/login");
  };

  if (user === undefined) return <Loading />;

  const ctx = { user, modules, counts, refreshCounts, logout, onLogin: loadSession };
  return (
    <AppCtx.Provider value={ctx}>
      <ToastProvider>
        {user === null ? (
          <Routes>
            <Route path="*" element={<Login />} />
          </Routes>
        ) : (
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/login" element={<Navigate to="/" />} />
              <Route path="/inbox" element={<Inbox box="inbox" />} />
              <Route path="/inbox/done" element={<Inbox box="done" />} />
              <Route path="/tasks/:id" element={<TaskPage />} />
              <Route path="/new" element={<NewRequest />} />
              <Route path="/requests" element={<Instances />} />
              <Route path="/requests/:id" element={<InstanceDetail />} />
              {user.is_staff && <>
                <Route path="/processes" element={<ProcessList />} />
                <Route path="/processes/:id" element={<ProcessDesigner />} />
                <Route path="/organization" element={<Organization />} />
                <Route path="/modules" element={<Modules />} />
              </>}
              <Route path="*" element={<div className="empty"><div className="big">صفحه یافت نشد</div></div>} />
            </Routes>
          </Layout>
        )}
      </ToastProvider>
    </AppCtx.Provider>
  );
}
