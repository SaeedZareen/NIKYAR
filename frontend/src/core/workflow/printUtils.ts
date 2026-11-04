import { toJalali } from "@/lib/jalali";

export function todayJ() {
  const j = toJalali(new Date());
  return `${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`;
}
