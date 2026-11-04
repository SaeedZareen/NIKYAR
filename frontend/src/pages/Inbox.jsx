import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { Empty, Loading, StatusBadge } from "../components/ui.jsx";
import { toFa } from "../fa.js";

export default function Inbox({ box }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    setItems(null);
    api(`/workflow/inbox/?box=${box}`).then(setItems).catch(() => setItems([]));
  }, [box]);

  const done = box === "done";
  const shown = (items || []).filter((w) => !q || `${w.name} ${w.instance_title} ${w.tracking_code} ${w.initiator_name}`.includes(q));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{done ? "کارهای انجام‌شده" : "کارتابل"}</h1>
          <p>{done ? "سوابق کارهایی که انجام داده‌اید" : "کارهایی که منتظر اقدام شما هستند"}</p>
        </div>
        <input className="input" style={{ maxWidth: 280 }} placeholder="جستجو در عنوان، شماره، ارسال‌کننده…"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card">
        {items === null ? <Loading /> : shown.length === 0 ? (
          <Empty title={done ? "هنوز کاری انجام نداده‌اید" : "کارتابل شما خالی است"}>
            {!done && "وقتی کاری به شما ارجاع شود، اینجا نمایش داده می‌شود."}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th>عنوان کار</th><th>درخواست</th><th>شماره پیگیری</th><th>شروع‌کننده</th>
                <th>{done ? "تاریخ انجام" : "تاریخ دریافت"}</th>{done && <th>وضعیت</th>}
              </tr></thead>
              <tbody>
                {shown.map((w) => (
                  <tr key={w.id} className={`clickable ${!done && !w.is_read ? "unread" : ""}`}
                    onClick={() => navigate(done ? `/requests/${w.instance_id}` : `/tasks/${w.id}`)}>
                    <td>{w.name}</td>
                    <td>{w.instance_title}<div className="small muted">{w.process_name}</div></td>
                    <td className="num">{toFa(w.tracking_code)}</td>
                    <td>{w.initiator_name}</td>
                    <td className="num small">{toFa(done ? w.completed_at : w.created_at)}</td>
                    {done && <td><StatusBadge status={w.status} label={w.status_display} /></td>}
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
