// ابزارهای فارسی: اعداد و تاریخ شمسی
import { toJalaali, toGregorian, jalaaliMonthLength } from "jalaali-js";

const FA = "۰۱۲۳۴۵۶۷۸۹";
export const toFa = (v) => (v === null || v === undefined ? "" : String(v).replace(/\d/g, (d) => FA[d]));
export const toEn = (v) => String(v ?? "").replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));

export const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
export const WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

export function todayJ() {
  const d = new Date();
  return toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
export const fmtJ = ({ jy, jm, jd }) => `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
export function parseJ(s) {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(toEn(s || "").trim());
  if (!m) return null;
  const [jy, jm, jd] = [+m[1], +m[2], +m[3]];
  if (jm < 1 || jm > 12 || jd < 1 || jd > jalaaliMonthLength(jy, jm)) return null;
  return { jy, jm, jd };
}
// شنبه = 0
export function weekdayOf(jy, jm, jd) {
  const g = toGregorian(jy, jm, jd);
  return (new Date(g.gy, g.gm - 1, g.gd).getDay() + 1) % 7;
}
export { jalaaliMonthLength };

export function longDate() {
  const t = todayJ();
  const names = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
  return `${names[new Date().getDay()]} ${toFa(t.jd)} ${MONTHS[t.jm - 1]} ${toFa(t.jy)}`;
}
