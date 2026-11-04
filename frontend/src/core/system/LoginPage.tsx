import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, GitBranch, ListTree } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/app/auth";
import { get } from "@/app/api";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = React.useState({ username: "", password: "" });
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const org = useQuery({ queryKey: ["public-settings"], queryFn: () => get<{ org_name: string }>("/settings/public/") });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(f.username, f.password);
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh bg-background text-foreground lg:grid-cols-2">
      <section className="hidden flex-col justify-between border-e border-border bg-card p-12 lg:flex">
        <div>
          <div className="text-3xl font-bold leading-tight">نیک‌یار</div>
          <p className="mt-2 text-muted-foreground">سامانه‌ی یکپارچه‌ی مدیریت فرایند و منابع سازمانی</p>
        </div>
        <ul className="space-y-5">
          {[
            [GitBranch, "فرایندساز و فرم‌ساز بدون کدنویسی", "فرایندهای سازمان را طراحی کنید و همان روز اجرا کنید."],
            [Building2, "کارتابل اداری بر پایه‌ی چارت سازمانی", "هر کار به‌طور خودکار به فرد درست می‌رسد."],
            [ListTree, "ماژولار و قابل توسعه", "پرونده‌ی پرسنلی امروز؛ حقوق، انبار و حسابداری فردا."],
          ].map(([Icon, title, desc]) => {
            const I = Icon as typeof GitBranch;
            return (
              <li key={title as string} className="flex gap-3">
                <I className="mt-1 size-5 shrink-0 text-brand" strokeWidth={1.75} />
                <div><div className="font-medium">{title as string}</div><div className="text-sm text-muted-foreground">{desc as string}</div></div>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">نسخه‌ی ۲٫۰</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-2xl font-bold leading-tight">ورود به سامانه</h1>
            <p className="mt-1 text-sm text-muted-foreground">{org.data?.org_name ? `${org.data.org_name} · ` : ""}نام کاربری و رمز عبور سازمانی خود را وارد کنید.</p>
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <FormField label="نام کاربری" htmlFor="u">
            <Input id="u" dir="ltr" autoFocus autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
          </FormField>
          <FormField label="رمز عبور" htmlFor="p">
            <Input id="p" dir="ltr" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </FormField>
          <Button type="submit" size="lg" className="w-full" disabled={busy || !f.username || !f.password}>
            {busy ? "در حال ورود…" : "ورود"} {!busy && <ArrowLeft className="size-4" />}
          </Button>
          <div className="rounded-field border-line border-dashed border-border p-3 text-xs leading-6 text-muted-foreground">
            <b className="text-foreground">کاربران نمایشی</b> با رمز <span dir="ltr">nikyar123</span>:<br />
            admin (مدیر کل) · hr_manager (مسئول پرسنلی) · it_manager (مدیر) · developer (کارمند)
          </div>
        </form>
      </section>
    </div>
  );
}
