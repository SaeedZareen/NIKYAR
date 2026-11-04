import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { Empty, Loading } from "../components/ui.jsx";
import { toFa } from "../fa.js";
import { SettingsModal } from "./ProcessDesigner.jsx";

export default function ProcessList() {
  const [items, setItems] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { api("/workflow/process-models/").then(setItems).catch(() => setItems([])); }, []);

  return (
    <>
      <div className="page-head">
        <div><h1>طراحی فرایندها</h1><p>فرایندهای سازمان را طراحی کنید، تغییر دهید و منتشر کنید.</p></div>
        <button className="btn btn-primary" onClick={() => setNewOpen(true)}>+ فرایند جدید</button>
      </div>
      <div className="card">
        {items === null ? <Loading /> : items.length === 0 ? <Empty title="هنوز فرایندی تعریف نشده است" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>نام فرایند</th><th>دسته</th><th>نسخه‌ی منتشرشده</th><th>آخرین ویرایش</th><th>وضعیت</th></tr></thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id} className="clickable" onClick={() => navigate(`/processes/${m.id}`)}>
                    <td><b>{m.name}</b><div className="small muted ltr" style={{ textAlign: "right" }}>{m.key}</div></td>
                    <td>{m.category || "—"}</td>
                    <td className="num">{m.latest_version ? toFa(m.latest_version.version) : "—"}</td>
                    <td className="num small">{toFa(m.updated_at)}</td>
                    <td>
                      {!m.is_active ? <span className="badge badge-gray">غیرفعال</span>
                        : !m.latest_version ? <span className="badge badge-amber">پیش‌نویس</span>
                        : m.has_unpublished_changes ? <span className="badge badge-amber">تغییرات منتشرنشده</span>
                        : <span className="badge badge-green">منتشرشده</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {newOpen && <SettingsModal isNew onClose={() => setNewOpen(false)} onSaved={(pm) => navigate(`/processes/${pm.id}`)} />}
    </>
  );
}
