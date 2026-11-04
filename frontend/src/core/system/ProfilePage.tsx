import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { post, tokenStore } from "@/app/api";
import { useAuth } from "@/app/auth";
import { KeyValue, PageHeader, Panel, useApiAction } from "@/app/ui";

export default function ProfilePage() {
  const { user, setTheme } = useAuth();
  const run = useApiAction();
  const [f, setF] = React.useState({ old_password: "", new_password: "", repeat: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  if (!user) return null;
  const change = async () => {
    if (f.new_password !== f.repeat) { setErrors({ repeat: "تکرار رمز با رمز جدید یکسان نیست." }); return; }
    const r = await run(() => post<{ token: string }>("/auth/change-password/", f), "رمز عبور تغییر کرد.");
    if (r.ok && r.data) { tokenStore.set(r.data.token); setF({ old_password: "", new_password: "", repeat: "" }); setErrors({}); } else setErrors(r.fields ?? {});
  };
  return (
    <>
      <PageHeader title="حساب کاربری" />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel title="مشخصات">
          <KeyValue items={[
            { label: "نام", value: user.full_name }, { label: "نام کاربری", value: user.username, ltr: true },
            { label: "سمت", value: user.positions.map((p) => `${p.title} (${p.unit})`).join("، ") },
            { label: "نقش‌ها", value: user.role_titles.join("، ") },
          ]} />
          <div className="mt-6">
            <FormField label="تم نمایش">
              <SegmentedControl value={user.theme} onChange={(v) => setTheme(v as "paper")} aria-label="تم"
                options={[{ value: "graphite", label: "تیره (گرافیت)" }, { value: "paper", label: "روشن (کاغذ)" }]} />
            </FormField>
          </div>
        </Panel>
        <Panel title="تغییر رمز عبور">
          <div className="space-y-4">
            <FormField label="رمز فعلی" htmlFor="op" error={errors.old_password}><Input id="op" dir="ltr" type="password" value={f.old_password} onChange={(e) => setF({ ...f, old_password: e.target.value })} /></FormField>
            <FormField label="رمز جدید" htmlFor="np" error={errors.new_password} hint="حداقل ۸ نویسه"><Input id="np" dir="ltr" type="password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} /></FormField>
            <FormField label="تکرار رمز جدید" htmlFor="rp" error={errors.repeat}><Input id="rp" dir="ltr" type="password" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} /></FormField>
            <Button onClick={change} disabled={!f.old_password || !f.new_password}>تغییر رمز</Button>
          </div>
        </Panel>
      </div>
    </>
  );
}
