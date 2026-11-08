import { useNavigate } from "react-router"
import { useMutation } from "@tanstack/react-query"
import { FilePlus2 } from "lucide-react"
import { toast } from "sonner"
import { Section } from "@/components/layout/section"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { api, errorMessage, unwrap } from "@/lib/api/client"
import { SAMPLE_FORM_DEFINITION } from "./sample-data"

/** ساخت و انتشار یک فرم نمونه با API فرم‌ساز تا صفحه‌ی «فرم‌ها» پیش از طراح دیداری (3.4) امتحان‌شدنی باشد. */
export function SampleFormSection() {
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: async () => {
      const form = await unwrap(
        api.POST("/api/forms/", { body: { code: `sample-${Date.now().toString(36)}`, title: "درخواست نمونه (کیت رابط کاربری)", fill_by_everyone: true } })
      )
      const version = form.draft_version as number
      await unwrap(api.PATCH("/api/forms/versions/{id}/", { params: { path: { id: version } }, body: { definition: SAMPLE_FORM_DEFINITION } }))
      await unwrap(api.POST("/api/forms/versions/{id}/publish/", { params: { path: { id: version } } }))
      return form
    },
    onSuccess: (form) => {
      toast.success("فرم نمونه ساخته و منتشر شد.")
      navigate(`/forms/${form.id}/fill`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <Section title="فرم‌ساز" description="یک فرم منتشرشده با نوع فیلدهای پایه و تخصصی می‌سازد که همه‌ی کاربران می‌توانند در صفحه‌ی «فرم‌ها» پر کنند.">
      <Button variant="outline" disabled={create.isPending} onClick={() => create.mutate()}>
        {create.isPending ? <Spinner /> : <FilePlus2 />}
        ساخت فرم نمونه
      </Button>
    </Section>
  )
}
