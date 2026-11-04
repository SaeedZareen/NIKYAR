import { useEffect, useRef, useState } from "react";
import { MONTHS, WEEKDAYS, fmtJ, jalaaliMonthLength, parseJ, toEn, toFa, todayJ, weekdayOf } from "../fa.js";

// انتخابگر تاریخ شمسی
export default function JalaliDate({ value, onChange, invalid, disabled }) {
  const [open, setOpen] = useState(false);
  const sel = parseJ(value);
  const [view, setView] = useState(() => sel || todayJ());
  const ref = useRef(null);
  const today = todayJ();

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const move = (d) => {
    let { jy, jm } = view;
    jm += d;
    if (jm < 1) { jm = 12; jy -= 1; }
    if (jm > 12) { jm = 1; jy += 1; }
    setView({ jy, jm, jd: 1 });
  };
  const first = weekdayOf(view.jy, view.jm, 1);
  const len = jalaaliMonthLength(view.jy, view.jm);
  const cells = [...Array(first).fill(null), ...Array.from({ length: len }, (_, i) => i + 1)];

  return (
    <div className="jdate" ref={ref}>
      <input className={`input ${invalid ? "invalid" : ""}`} value={toFa(value || "")} placeholder="۱۴۰۵/۰۱/۰۱"
        disabled={disabled} onFocus={() => setOpen(true)}
        onChange={(e) => onChange(toEn(e.target.value))} />
      {open && !disabled && (
        <div className="jcal">
          <div className="jcal-head">
            <button type="button" onClick={() => move(-1)} aria-label="ماه قبل">›</button>
            <span>{MONTHS[view.jm - 1]} {toFa(view.jy)}</span>
            <button type="button" onClick={() => move(1)} aria-label="ماه بعد">‹</button>
          </div>
          <div className="jcal-grid">
            {WEEKDAYS.map((w) => <div key={w} className="wd">{w}</div>)}
            {cells.map((d, i) => d === null ? <span key={`e${i}`} /> : (
              <button type="button" key={d}
                className={[
                  sel && sel.jy === view.jy && sel.jm === view.jm && sel.jd === d ? "sel" : "",
                  today.jy === view.jy && today.jm === view.jm && today.jd === d ? "today" : "",
                  (first + d - 1) % 7 === 6 ? "fri" : "",
                ].join(" ")}
                onClick={() => { onChange(fmtJ({ jy: view.jy, jm: view.jm, jd: d })); setOpen(false); }}>
                {toFa(d)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
