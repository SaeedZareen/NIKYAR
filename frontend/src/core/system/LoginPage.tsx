import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Building2, GitBranch, ListTree } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { FormField } from "@/components/ui/form";
import { useAuth } from "@/app/auth";
import { get } from "@/app/api";
import { SubmitButton, useDocumentTitle } from "@/app/ui";

const FEATURES = [
  { icon: GitBranch, title: "فرایندساز و فرم‌ساز بدون کدنویسی", desc: "فرایندهای سازمان را طراحی کنید و همان روز اجرا کنید." },
  { icon: Building2, title: "کارتابل اداری بر پایه‌ی چارت سازمانی", desc: "هر کار به‌طور خودکار به فرد درست می‌رسد." },
  { icon: ListTree, title: "ماژولار و قابل توسعه", desc: "پرونده‌ی پرسنلی امروز؛ حقوق، انبار و حسابداری فردا." },
];

export default function LoginPage() {
  useDocumentTitle("ورود");
  const { login } = useAuth();
  const navigate = useNavigate();
  const org = useQuery({ queryKey: ["public-settings"], queryFn: () => get<{ org_name: string }>("/settings/public/") });
  const [f, setF] = React.useState({ username: "", password: "" });
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const errorRef = React.useRef<HTMLDivElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.username || !f.password) {
      setError("نام کاربری و رمز عبور را وارد کنید.");
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setBusy(true);
    setError("");
    try {
      await login(f.username, f.password);
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh bg-background text-foreground lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-topbar p-12 text-topbar-foreground lg:flex" aria-label="معرفی سامانه">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid size-11 place-items-center rounded-control bg-topbar-foreground text-lg font-bold text-topbar">ن</span>
          <div>
            <div className="text-2xl font-bold leading-tight">نیک‌یار</div>
            <div className="text-sm opacity-80">سامانه‌ی یکپارچه‌ی مدیریت فرایند و منابع سازمانی</div>
          </div>
        </div>
        <ul className="space-y-6">
          {FEATURES.map((x) => (
            <li key={x.title} className="flex gap-4">
              <x.icon className="mt-1 size-6 shrink-0 opacity-90" strokeWidth={1.75} aria-hidden />
              <div><div className="font-semibold">{x.title}</div><div className="text-sm opacity-80">{x.desc}</div></div>
            </li>
          ))}
        </ul>
        <p className="text-sm opacity-90">نسخه‌ی ۲٫۰</p>
      </section>
      <main id="main" className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5" noValidate aria-describedby={error ? "login-error" : undefined}>
          <div>
            <h1 className="text-2xl font-bold leading-tight">ورود به سامانه</h1>
            <p className="mt-1 text-muted-foreground">{org.data?.org_name ? `${org.data.org_name} · ` : ""}با نام کاربری و رمز عبور سازمانی وارد شوید.</p>
          </div>
          {error && (
            <div ref={errorRef} id="login-error" tabIndex={-1} role="alert"
              className="flex items-start gap-2 rounded-field border-line border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive focus-visible:outline-none">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
            </div>
          )}
          <FormField label="نام کاربری" htmlFor="u" required>
            <Input id="u" name="username" dir="ltr" autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false}
              value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} aria-invalid={!!error && !f.username} />
          </FormField>
          <FormField label="رمز عبور" htmlFor="p" required>
            <PasswordInput id="p" name="password" autoComplete="current-password" value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })} aria-invalid={!!error && !f.password} />
          </FormField>
          <SubmitButton type="submit" size="lg" className="w-full" loading={busy} loadingText="در حال ورود…">
            ورود <ArrowLeft className="size-4" aria-hidden />
          </SubmitButton>
          <details className="rounded-field border-line border-border p-3 text-sm text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">کاربران نمایشی</summary>
            <p className="mt-2 leading-7">رمز همه: <bdi dir="ltr">nikyar123</bdi><br />
              admin (مدیر کل) · hr_manager (مسئول پرسنلی) · it_manager (مدیر) · developer (کارمند)</p>
          </details>
        </form>
      </main>
    </div>
  );
}
