import * as React from "react"
import { useSearchParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, Lock, Pencil, Plus, Trash2 } from "lucide-react"
import { z } from "zod"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { actionsColumn, columnHelper, DataTable, useDataTable, useTableView, type DataTableColumn } from "@/components/data-table"
import { ErrorSummary } from "@/components/form/error-summary"
import { FormField } from "@/components/form/form-field"
import { FormGrid } from "@/components/form/form-grid"
import { FormSheet } from "@/components/form/form-sheet"
import { applyServerErrors } from "@/components/form/server-errors"
import { useAppForm } from "@/components/form/use-app-form"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { SectionNav } from "@/components/layout/section-nav"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client"
import { formatNumber } from "@/lib/format"
import { schemas } from "@/lib/validators"

type LookupList = Schemas["LookupList"]
type Item = Schemas["LookupItem"]
const EMPTY: Item[] = []
const col = columnHelper<Item>()

export default function LookupsPage() {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const lists = useQuery({ queryKey: ["lookups", "lists"], queryFn: () => unwrap(api.GET("/api/lookups/lists/")) })
  const code = params.get("list") ?? lists.data?.[0]?.code
  const list = lists.data?.find((l) => l.code === code) ?? null
  const items = useQuery({
    queryKey: ["lookups", "items", code],
    queryFn: () => unwrap(api.GET("/api/lookups/items/", { params: { query: { list: code } } })),
    enabled: !!code,
  })

  const [dialog, setDialog] = React.useState<
    { kind: "list"; list: LookupList | null } | { kind: "item"; item: Item | null } | { kind: "delete-item"; item: Item } | { kind: "delete-list"; list: LookupList } | null
  >(null)
  const close = () => setDialog(null)
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lookups"] })
    qc.invalidateQueries({ queryKey: ["lookup-items"] })
  }
  const mutate = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: invalidate, onError: (e) => toast.error(errorMessage(e)) })

  const locked = !!list?.is_system
  const sorted = items.data ?? EMPTY
  const run = mutate.mutate
  const columns = React.useMemo<DataTableColumn<Item>[]>(() => {
    const move = (item: Item, delta: -1 | 1) => {
      const i = sorted.findIndex((x) => x.id === item.id)
      const other = sorted[i + delta]
      if (!other) return
      run(async () => {
        // ترتیب بر اساس جایگاه در فهرست (نه مقدار order) تا ترتیب‌های تکراری هم درست شوند.
        await unwrap(api.PATCH("/api/lookups/items/{id}/", { params: { path: { id: item.id } }, body: { order: i + delta } }))
        await unwrap(api.PATCH("/api/lookups/items/{id}/", { params: { path: { id: other.id } }, body: { order: i } }))
      })
    }
    return [
      col.accessor("title", { header: "عنوان", enableSorting: false, meta: { label: "عنوان", primary: true, wrap: true } }),
      col.accessor("code", { header: "کد", enableSorting: false, meta: { label: "کد" }, cell: (c) => <bdi dir="ltr">{c.getValue()}</bdi> }),
      col.accessor((i) => String(i.is_active), {
        id: "is_active",
        header: "وضعیت",
        enableSorting: false,
        meta: { label: "وضعیت", exportValue: (i) => (i.is_active ? "فعال" : "غیرفعال") },
        cell: (c) => <StatusBadge tone={c.row.original.is_active ? "success" : "neutral"}>{c.row.original.is_active ? "فعال" : "غیرفعال"}</StatusBadge>,
      }),
      ...(locked
        ? []
        : [
            actionsColumn<Item>((item) => (
              <>
                <DropdownMenuItem onSelect={() => setDialog({ kind: "item", item })}>
                  <Pencil /> ویرایش
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => move(item, -1)}>
                  <ArrowUp /> بالاتر
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => move(item, 1)}>
                  <ArrowDown /> پایین‌تر
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ kind: "delete-item", item })}>
                  <Trash2 /> حذف
                </DropdownMenuItem>
              </>
            )),
          ]),
    ]
  }, [locked, sorted, run])
  const view = useTableView("lookup-items", { urlKey: "i." })
  const table = useDataTable({ view, columns, data: sorted, getRowId: (i) => String(i.id) })

  return (
    <>
      <PageHeader
        title="فهرست‌های پایه"
        description="مقدارهای انتخابی فرم‌ها. فهرست‌های سیستمی قفل‌اند، چون منطق سامانه به آن‌ها وابسته است."
        breadcrumbs={[{ label: "مدیریت سامانه" }]}
        actions={
          <Button onClick={() => setDialog({ kind: "list", list: null })}>
            <Plus /> فهرست جدید
          </Button>
        }
      />
      <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Section title="فهرست‌ها" contentClassName="p-2">
          <SectionNav
            label="فهرست‌های پایه"
            items={lists.data?.map((l) => ({
              key: l.code,
              label: l.name,
              icon: l.is_system ? <Lock className="size-3.5 text-muted-foreground" aria-label="سیستمی" /> : undefined,
              meta: formatNumber(l.item_count),
            }))}
            current={code}
            onSelect={(list) => setParams({ list }, { replace: true })}
          />
        </Section>

        {list && (
          <Section
            title={list.name}
            description={list.description || undefined}
            actions={
              !locked && (
                <>
                  <Button size="sm" onClick={() => setDialog({ kind: "item", item: null })}>
                    <Plus /> مقدار جدید
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "list", list })}>
                    <Pencil /> ویرایش فهرست
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDialog({ kind: "delete-list", list })}>
                    <Trash2 /> حذف
                  </Button>
                </>
              )
            }
          >
            <div className="flex flex-col gap-3">
              {locked && (
                <Alert>
                  <Lock />
                  <AlertTitle>این فهرست سیستمی و قفل است</AlertTitle>
                  <AlertDescription>منطق سامانه به کد این مقدارها وابسته است؛ برای جلوگیری از خطا، افزودن، ویرایش و حذف آن‌ها ممکن نیست.</AlertDescription>
                </Alert>
              )}
              <DataTable
                table={table}
                view={view}
                caption={`مقدارهای ${list.name}`}
                loading={items.isPending}
                error={items.error}
                onRetry={() => items.refetch()}
                searchPlaceholder="عنوان یا کد"
                empty={{ title: "این فهرست هنوز مقداری ندارد" }}
              />
            </div>
          </Section>
        )}
      </div>

      {dialog?.kind === "list" && (
        <ListSheet
          list={dialog.list}
          open
          onOpenChange={close}
          onSaved={(l) => {
            invalidate()
            setParams({ list: l.code }, { replace: true })
          }}
        />
      )}
      {dialog?.kind === "item" && list && <ItemSheet list={list} item={dialog.item} open onOpenChange={close} onSaved={invalidate} />}
      {dialog?.kind === "delete-item" && (
        <ConfirmDialog
          open
          onOpenChange={close}
          title={`«${dialog.item.title}» حذف شود؟`}
          description="اگر این مقدار در پرونده‌ها استفاده شده باشد، به‌جای حذف آن را غیرفعال کنید تا سوابق درست بماند."
          confirmLabel="حذف"
          destructive
          onConfirm={() => mutate.mutateAsync(() => unwrap(api.DELETE("/api/lookups/items/{id}/", { params: { path: { id: dialog.item.id } } })))}
        />
      )}
      {dialog?.kind === "delete-list" && (
        <ConfirmDialog
          open
          onOpenChange={close}
          title={`فهرست «${dialog.list.name}» حذف شود؟`}
          description="همه‌ی مقدارهای این فهرست هم حذف می‌شوند."
          confirmLabel="حذف فهرست"
          destructive
          onConfirm={() =>
            mutate.mutateAsync(async () => {
              await unwrap(api.DELETE("/api/lookups/lists/{id}/", { params: { path: { id: dialog.list.id } } }))
              setParams({}, { replace: true })
            })
          }
        />
      )}
    </>
  )
}

const listSchema = z.object({
  name: schemas.required("عنوان فهرست"),
  code: z
    .string()
    .trim()
    .min(1, "تکمیل «کد» الزامی است.")
    .regex(/^[a-z0-9_-]+$/, "کد فقط حروف کوچک لاتین، رقم، خط تیره و زیرخط است."),
  description: z.string(),
})

function ListSheet({ list, open, onOpenChange, onSaved }: { list: LookupList | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved: (l: LookupList) => void }) {
  const isNew = !list
  const form = useAppForm(listSchema, { name: list?.name ?? "", code: list?.code ?? "", description: list?.description ?? "" })
  const save = useMutation({
    mutationFn: (body: Schemas["LookupListRequest"]) =>
      isNew ? unwrap(api.POST("/api/lookups/lists/", { body })) : unwrap(api.PATCH("/api/lookups/lists/{id}/", { params: { path: { id: list.id } }, body })),
    onSuccess: (saved) => {
      toast.success(isNew ? `فهرست «${saved.name}» ایجاد شد.` : `فهرست «${saved.name}» ذخیره شد.`)
      onSaved(saved)
      onOpenChange(false)
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync(v)
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  return (
    <FormSheet open={open} onOpenChange={onOpenChange} title={isNew ? "فهرست جدید" : `ویرایش «${list.name}»`} onSubmit={onSubmit} submitting={save.isPending}>
      <ErrorSummary errors={form.formState.errors} labels={{ name: "عنوان فهرست", code: "کد", description: "توضیح" }} submitCount={form.formState.submitCount} />
      <FormGrid>
        <FormField control={form.control} name="name" label="عنوان فهرست" required render={({ field, id, aria }) => <Input id={id} {...field} {...aria} />} />
        <FormField
          control={form.control}
          name="code"
          label="کد"
          required
          description="شناسه‌ی لاتین ثابت، مثل bank."
          render={({ field, id, aria }) => <Input id={id} dir="ltr" autoComplete="off" {...field} {...aria} />}
        />
        <FormField control={form.control} name="description" label="توضیح" render={({ field, id, aria }) => <Input id={id} {...field} {...aria} />} />
      </FormGrid>
    </FormSheet>
  )
}

const itemSchema = z.object({ title: schemas.required("عنوان"), is_active: z.boolean() })

function ItemSheet({ list, item, open, onOpenChange, onSaved }: { list: LookupList; item: Item | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const isNew = !item
  const form = useAppForm(itemSchema, { title: item?.title ?? "", is_active: item?.is_active ?? true })
  const save = useMutation({
    mutationFn: (v: z.output<typeof itemSchema>) =>
      isNew
        ? unwrap(api.POST("/api/lookups/items/", { body: { ...v, list: list.id, order: list.item_count } }))
        : unwrap(api.PATCH("/api/lookups/items/{id}/", { params: { path: { id: item.id } }, body: v })),
    onSuccess: (saved) => {
      toast.success(isNew ? `«${saved.title}» به فهرست اضافه شد.` : `«${saved.title}» ذخیره شد.`)
      onSaved()
      onOpenChange(false)
    },
  })
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync(v)
    } catch (e) {
      applyServerErrors(form, e)
    }
  })
  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? `مقدار جدید در «${list.name}»` : `ویرایش «${item.title}»`}
      description={isNew ? "کد لاتین مقدار خودکار ساخته می‌شود." : `کد: ${item.code}`}
      onSubmit={onSubmit}
      submitting={save.isPending}
    >
      <ErrorSummary errors={form.formState.errors} labels={{ title: "عنوان", is_active: "فعال" }} submitCount={form.formState.submitCount} />
      <FormGrid>
        <FormField control={form.control} name="title" label="عنوان" required render={({ field, id, aria }) => <Input id={id} {...field} {...aria} />} />
        <FormField
          control={form.control}
          name="is_active"
          label="فعال"
          description="مقدار غیرفعال در فرم‌های جدید نمایش داده نمی‌شود ولی در سوابق می‌ماند."
          render={({ field, id }) => (
            <div className="flex min-h-7 items-center gap-2">
              <Switch id={id} checked={field.value} onCheckedChange={field.onChange} />
              <span className="text-xs text-muted-foreground">{field.value ? "قابل انتخاب" : "غیرفعال"}</span>
            </div>
          )}
        />
      </FormGrid>
    </FormSheet>
  )
}
