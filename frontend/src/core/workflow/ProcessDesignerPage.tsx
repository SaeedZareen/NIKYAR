/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Download, Rocket, Save } from "lucide-react";
import Modeler from "bpmn-js/lib/Modeler";
import camundaModdle from "camunda-bpmn-moddle/resources/camunda.json";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { get, patch, post } from "@/app/api";
import { PageError, LoadingBlock, useApiAction, useDocumentTitle } from "@/app/ui";
import type { FormSchema } from "@/core/forms/types";
import { fa } from "@/lib/utils";
import { AssignmentBuilder, PropertiesPanel, type ActionInfo, type Directory } from "./designer/PropertiesPanel";
import translateModule from "./designer/translate";
import nikyarPalette from "./designer/palette";

export type ProcessModel = {
  id: number; key: string; title: string; description: string; category: string; form: number | null; form_key: string;
  form_title: string; starters: string; title_template: string; is_active: boolean; draft_xml: string;
  latest_version: { version: number; published_at: string } | null; has_draft_changes: boolean; updated_at: string; instance_count: number;
};
type FormRow = { id: number; key: string; title: string; entity: string; draft_schema: FormSchema; latest_version: { version: number } | null };

export default function ProcessDesignerPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const run = useApiAction();
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const [modeler, setModeler] = React.useState<any>(null);
  const [selected, setSelected] = React.useState<any>(null);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const model = useQuery({ queryKey: ["process", id], queryFn: () => get<ProcessModel>(`/workflow/processes/${id}/`) });
  const forms = useQuery({ queryKey: ["forms"], queryFn: () => get<FormRow[]>("/forms/?entity=") });
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => get<{ actions: ActionInfo[] }>("/system/catalog/") });
  const dir = useQuery({
    queryKey: ["directory"],
    queryFn: async (): Promise<Directory> => {
      const [users, units, roles] = await Promise.all([
        get<Directory["users"]>("/users/brief/"), get<Directory["units"]>("/org/units/"), get<Directory["roles"]>("/roles/").catch(() => []),
      ]);
      return { users, units, roles };
    },
  });

  const xml = model.data?.draft_xml;
  React.useEffect(() => {
    if (!xml || !canvasRef.current) return;
    const m: any = new Modeler({
      container: canvasRef.current,
      moddleExtensions: { camunda: camundaModdle },
      additionalModules: [translateModule, nikyarPalette],
      keyboard: { bindTo: document },
    });
    const root = () => m.get("canvas").getRootElement();
    m.on("selection.changed", ({ newSelection }: any) => {
      const el = newSelection[0];
      setSelected(el ? el.labelTarget || el : root());
    });
    m.on("commandStack.changed", () => setDirty(true));
    m.importXML(xml).then(() => {
      const canvas = m.get("canvas");
      canvas.zoom("fit-viewport", "auto");
      if (canvas.zoom() > 1) canvas.zoom(1);
      canvas.scroll({ dx: 110, dy: 0 });
      setSelected(root());
      setDirty(false);
    });
    setModeler(m);
    return () => m.destroy();
    // فقط یک‌بار با پیش‌نویس اولیه بارگذاری می‌شود
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!xml]);

  React.useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  useDocumentTitle(model.data ? `فرایندساز: ${model.data.title}` : "فرایندساز");
  if (model.isLoading) return <LoadingBlock rows={8} />;
  if (model.error || !model.data) return <PageError error={model.error} onRetry={() => model.refetch()} back={{ to: "/processes", label: "فرایندساز" }} />;
  const pm = model.data;
  const form = forms.data?.find((f) => f.id === pm.form) ?? null;
  const schema = form ? form.draft_schema : null;

  const saveXml = async () => {
    const { xml: out } = await modeler.saveXML({ format: true });
    const r = await patch<ProcessModel>(`/workflow/processes/${id}/`, { draft_xml: out });
    qc.setQueryData(["process", id], r);
    setDirty(false);
    return out as string;
  };
  const act = async (fn: () => Promise<unknown>, msg?: string) => {
    setBusy(true);
    await run(async () => { const r = await fn(); await qc.invalidateQueries({ queryKey: ["process", id] }); return r; }, msg);
    setBusy(false);
  };
  const updateModel = (body: Partial<ProcessModel>) => act(() => patch(`/workflow/processes/${id}/`, body));

  const exportXml = async () => {
    const { xml: out } = await modeler.saveXML({ format: true });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([out], { type: "application/xml" }));
    a.download = `${pm.key}.bpmn`;
    a.click();
  };

  const settings = (
    <ProcessSettings pm={pm} forms={(forms.data ?? []).filter((f) => !f.entity)} directory={dir.data ?? { users: [], units: [], roles: [] }}
      onSave={updateModel} formNotPublished={!!form && !form.latest_version} />
  );

  return (
    <div className="flex h-full flex-col">
      <div role="toolbar" aria-label="ابزار فرایندساز" className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <Link to="/processes" className="inline-flex size-8 items-center justify-center rounded-control hover:bg-accent" aria-label="بازگشت به فهرست فرایندها"><ArrowRight className="size-4" aria-hidden /></Link>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold">{pm.title}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {pm.latest_version ? <>نسخه‌ی منتشرشده {fa(pm.latest_version.version)} · {fa(pm.latest_version.published_at)}</> : "هنوز منتشر نشده"}
            {dirty ? " · تغییرات ذخیره‌نشده" : pm.has_draft_changes && pm.latest_version ? " · تغییرات منتشرنشده" : ""}
          </p>
        </div>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={exportXml}><Download className="size-4" aria-hidden /> فایل BPMN</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act(async () => { const x = await saveXml(); return post(`/workflow/processes/${id}/check/`, { xml: x }).then((r: any) => r); }, "دیاگرام بررسی شد و مشکلی ندارد.")}>
          <CheckCircle2 className="size-4" aria-hidden /> بررسی صحت
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act(saveXml, "پیش‌نویس ذخیره شد.")}><Save className="size-4" aria-hidden /> ذخیره</Button>
        <Button size="sm" variant="default" disabled={busy} onClick={() => act(async () => { await saveXml(); return post(`/workflow/processes/${id}/publish/`); }, "فرایند منتشر شد.")}>
          <Rocket className="size-4" aria-hidden /> انتشار
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 bg-card">
          <div ref={canvasRef} dir="ltr" role="application" aria-label="بوم طراحی فرایند؛ برای تنظیم هر مرحله آن را انتخاب کنید و از پنل تنظیمات استفاده کنید" className="bpmn-surface h-full" />
          {busy && <div role="status" className="absolute inset-x-0 top-0 h-1 animate-pulse bg-brand"><span className="sr-only">در حال ذخیره</span></div>}
        </div>
        <div className="w-72 shrink-0 overflow-y-auto border-s border-border bg-card xl:w-80" role="region" aria-label="تنظیمات عنصر انتخاب‌شده">
          <PropertiesPanel modeler={modeler} element={selected} directory={dir.data ?? { users: [], units: [], roles: [] }}
            actions={catalog.data?.actions ?? []} schema={schema} formTitle={form?.title ?? ""} processSettings={settings} />
        </div>
      </div>
    </div>
  );
}

function ProcessSettings({ pm, forms, directory, onSave, formNotPublished }: {
  pm: ProcessModel; forms: FormRow[]; directory: Directory; onSave: (b: Partial<ProcessModel>) => void; formNotPublished: boolean;
}) {
  const [f, setF] = React.useState({ title: pm.title, description: pm.description, category: pm.category, title_template: pm.title_template });
  const changed = f.title !== pm.title || f.description !== pm.description || f.category !== pm.category || f.title_template !== pm.title_template;
  return (
    <div className="space-y-4">
      <FormField label="نام فرایند" htmlFor="p-title" required><Input id="p-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></FormField>
      <FormField label="دسته" htmlFor="p-cat"><Input id="p-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></FormField>
      <FormField label="توضیحات" htmlFor="p-desc"><Textarea id="p-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} autoResize /></FormField>
      <FormField label="الگوی عنوان درخواست" htmlFor="p-tt" hint="مثل: مرخصی {initiator_name}">
        <Input id="p-tt" value={f.title_template} onChange={(e) => setF({ ...f, title_template: e.target.value })} />
      </FormField>
      {changed && <Button size="sm" onClick={() => onSave(f)}>ذخیره‌ی مشخصات</Button>}
      <FormField label="فرم اصلی فرایند" htmlFor="p-form" hint="فیلدهای این فرم در مراحل مختلف قابل‌ویرایش، فقط‌خواندنی یا مخفی می‌شوند.">
        <Select id="p-form" value={String(pm.form ?? "")} placeholder="بدون فرم" options={forms.map((x) => ({ value: String(x.id), label: x.title }))}
          onChange={(e) => onSave({ form: e.target.value ? Number(e.target.value) : null })} />
      </FormField>
      {formNotPublished && <Alert variant="warning">فرم انتخاب‌شده هنوز منتشر نشده است؛ پیش از انتشار فرایند، فرم را منتشر کنید.</Alert>}
      <AssignmentBuilder label="چه کسانی می‌توانند این درخواست را ثبت کنند" value={pm.starters} directory={directory}
        hint="خالی یعنی همه‌ی کاربران." onChange={(v) => onSave({ starters: v })} />
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <Switch checked={pm.is_active} onCheckedChange={(v) => onSave({ is_active: v })} aria-label="فعال" /> فعال (در فهرست «ثبت درخواست جدید» نمایش داده شود)
      </label>
    </div>
  );
}
