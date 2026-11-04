import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useApp } from "../App.jsx";
import { Empty, Loading, StatusBadge } from "../components/ui.jsx";
import { toEn, toFa } from "../fa.js";

export default function Instances() {
  const { user } = useApp();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState({ status: "", q: "", mine: user.is_staff ? "" : "" });
  const navigate = useNavigate();

  useEffect(() => {
    const p = new URLSearchParams(Object.entries(filter).filter(([, v]) => v).map(([k, v]) => [k, toEn(v)]));
    const h = setTimeout(() => api(`/workflow/instances/?${p}`).then(setItems).catch(() => setItems([])), 250);
    return () => clearTimeout(h);
  }, [filter]);

  return (
    <>
      <div className="page-head">
        <div><h1>پیگیری درخواست‌ها</h1><p>درخواست‌هایی که ثبت کرده‌اید یا در آن‌ها مشارکت داشته‌اید</p></div>
      </div>
      <div className="card">
        <div className="card-head" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
          <input className="input input-sm" style={{ maxWidth: 260 }} placeholder="شماره پیگیری یا عنوان"
            value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
          <select className="input input-sm" style={{ maxWidth: 160 }} value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            <option value="">همه‌ی وضعیت‌ها</option>
            <option value="running">در جریان</option>
            <option value="completed">خاتمه‌یافته</option>
            <option value="cancelled">لغو شده</option>
          </select>
          <label className="check small">
            <input type="checkbox" checked={filter.mine === "1"} onChange={(e) => setFilter({ ...filter, mine: e.target.checked ? "1" : "" })} />
            فقط درخواست‌های من
          </label>
        </div>
        {items === null ? <Loading /> : items.length === 0 ? <Empty title="درخواستی یافت نشد" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>شماره پیگیری</th><th>عنوان</th><th>نوع فرایند</th><th>شروع‌کننده</th><th>تاریخ ثبت</th><th>مرحله‌ی جاری</th><th>وضعیت</th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="clickable" onClick={() => navigate(`/requests/${i.id}`)}>
                    <td className="num">{toFa(i.tracking_code)}</td>
                    <td>{i.title}</td>
                    <td>{i.process_name}</td>
                    <td>{i.initiator_name}</td>
                    <td className="num small">{toFa(i.started_at)}</td>
                    <td className="small">{i.current_tasks.join("، ") || "—"}</td>
                    <td><StatusBadge status={i.status} label={i.status_display} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
