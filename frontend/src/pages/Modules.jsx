import { useApp } from "../App.jsx";
import { toFa } from "../fa.js";

const FUTURE = [
  ["inventory", "انبار و کالا", "تعریف کالا، ورود و خروج، موجودی، درخواست کالا از انبار"],
  ["purchasing", "خرید و تدارکات", "درخواست خرید، استعلام، سفارش خرید، تأمین‌کنندگان"],
  ["accounting", "حسابداری و خزانه", "اسناد حسابداری، دفاتر، چک و بانک، گزارش‌های مالی"],
  ["hr", "منابع انسانی و حقوق", "پرونده‌ی پرسنلی، حضور و غیاب، حقوق و دستمزد"],
  ["sales", "فروش و مشتریان", "پیش‌فاکتور، فاکتور، مشتریان، پیگیری فروش"],
];

export default function Modules() {
  const { modules } = useApp();
  return (
    <>
      <div className="page-head">
        <div><h1>ماژول‌ها و لایسنس</h1><p>ماژول‌های فعال سازمان شما</p></div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <dl className="kv">
            <dt>دارنده‌ی لایسنس</dt><dd>{modules?.customer}</dd>
            <dt>تاریخ انقضا</dt><dd className="num">{modules?.expires ? toFa(modules.expires) : "نامحدود"}</dd>
          </dl>
          {modules?.expired && <div className="alert alert-error" style={{ marginTop: 12 }}>لایسنس سازمان منقضی شده است.</div>}
        </div>
      </div>
      <div className="grid grid-3">
        {modules?.modules.map((m) => (
          <div className="card process-card" key={m.code}>
            <div className="cat">{m.is_core ? "ماژول پایه" : "ماژول تکمیلی"}</div>
            <h3>{m.title}</h3>
            <p>{m.description}</p>
            <span className={`badge ${m.enabled ? "badge-green" : "badge-gray"}`} style={{ alignSelf: "flex-start" }}>
              {m.enabled ? "فعال" : "غیرفعال"}
            </span>
          </div>
        ))}
        {FUTURE.map(([code, title, desc]) => (
          <div className="card process-card" key={code} style={{ opacity: 0.7 }}>
            <div className="cat" style={{ color: "var(--text-3)" }}>ماژول تکمیلی ERP</div>
            <h3>{title}</h3>
            <p>{desc}</p>
            <span className="badge badge-gray" style={{ alignSelf: "flex-start" }}>در دست توسعه</span>
          </div>
        ))}
      </div>
    </>
  );
}
