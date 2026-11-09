// متن صفحه‌ی تأیید پس از ثبت (پیام قالب‌دار فرم با جای‌گذارها).

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c)

/** پیام صفحه‌ی تأیید با جای‌گذارهای {شماره}، {نام}، {تاریخ} و {فرم} (مقدارها امن جای‌گذاری می‌شوند). */
export function confirmationHtml(template: string | undefined, values: { number: string; name: string; date: string; form: string }) {
  const html = template || "<p>فرم «{فرم}» ثبت شد.</p>"
  const map: Record<string, string> = { شماره: values.number || "—", نام: values.name, تاریخ: values.date, فرم: values.form }
  return html.replace(/\{(شماره|نام|تاریخ|فرم)\}/g, (_, key: string) => escape(map[key]))
}

