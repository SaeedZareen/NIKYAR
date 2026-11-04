import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useApp } from "../App.jsx";
import { Empty, StatusBadge } from "../components/ui.jsx";
import { toFa } from "../fa.js";

export default function Dashboard() {
  const { user } = useApp();
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [mine, setMine] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api("/workflow/dashboard/").then(setStats).catch(() => {});
    api("/workflow/inbox/").then((r) => setItems(r.slice(0, 5))).catch(() => {});
    api("/workflow/instances/?mine=1").then((r) => setMine(r.slice(0, 5))).catch(() => {});
  }, []);

  const tiles = [
    ["کارهای در انتظار", stats?.inbox_open, "مورد"],
    ["خوانده‌نشده", stats?.inbox_unread, "مورد"],
    ["درخواست‌های در جریان من", stats?.my_running, "درخواست"],
    ["کارهای انجام‌شده توسط من", stats?.done_by_me, "مورد"],
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{user.first_name ? `${user.first_name} عزیز، خوش آمدید` : "خوش آمدید"}</h1>
          <p>خلاصه‌ی کارها و درخواست‌های شما</p>
        </div>
        <Link className="btn btn-primary" to="/new">+ ثبت درخواست جدید</Link>
      </div>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        {tiles.map(([label, v, unit]) => (
          <div className="card stat" key={label}>
            <div className="label">{label}</div>
            <div className="value num">{v == null ? "—" : toFa(v)}<small>{unit}</small></div>
          </div>
        ))}
      </div>
      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><h2>آخرین کارهای کارتابل</h2><Link to="/inbox" className="small">مشاهده‌ی همه</Link></div>
          {items.length === 0 ? <Empty title="کارتابل شما خالی است">کار جدیدی در انتظار شما نیست.</Empty> : (
            <table className="table"><tbody>
              {items.map((w) => (
                <tr key={w.id} className={`clickable ${w.is_read ? "" : "unread"}`} onClick={() => navigate(`/tasks/${w.id}`)}>
                  <td>{w.name}<div className="small muted">{w.process_name} · {w.initiator_name}</div></td>
                  <td className="small muted num" style={{ textAlign: "left" }}>{toFa(w.created_at)}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2>درخواست‌های اخیر من</h2><Link to="/requests" className="small">مشاهده‌ی همه</Link></div>
          {mine.length === 0 ? <Empty title="هنوز درخواستی ثبت نکرده‌اید" /> : (
            <table className="table"><tbody>
              {mine.map((i) => (
                <tr key={i.id} className="clickable" onClick={() => navigate(`/requests/${i.id}`)}>
                  <td>{i.title}<div className="small muted num">شماره {toFa(i.tracking_code)}</div></td>
                  <td style={{ textAlign: "left" }}><StatusBadge status={i.status} label={i.status_display} /></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>
    </>
  );
}
