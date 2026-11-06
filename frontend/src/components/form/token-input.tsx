import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type Token = { token: string; label: string }

type Props = {
  id?: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  /** نشانه‌ها یا جای‌گذارهایی که با دکمه درج می‌شوند، مثل {year} یا {name}. */
  tokens: Token[]
  /** نام گروه دکمه‌ها برای صفحه‌خوان، مثل «افزودن نشانه به الگو». */
  tokensLabel: string
  multiline?: boolean
  maxLength?: number
} & Pick<React.AriaAttributes, "aria-invalid" | "aria-describedby" | "aria-required">

/**
 * فیلد متن با دکمه‌های درج نشانه (الگوی شماره، متن اعلان): نشانه در آخرین جای مکان‌نما درج می‌شود؛
 * تا کاربر در فیلد کلیک نکرده، به انتهای متن افزوده می‌شود و نشانه‌ی بعدی پشت همین یکی می‌آید.
 */
export function TokenInput({ id, value, onChange, onBlur, tokens, tokensLabel, multiline, maxLength, ...aria }: Props) {
  const caret = React.useRef<{ start: number; end: number } | null>(null)
  const remember = (el: HTMLInputElement | HTMLTextAreaElement) => {
    caret.current = { start: el.selectionStart ?? el.value.length, end: el.selectionEnd ?? el.value.length }
  }
  const insert = (token: string) => {
    const { start, end } = caret.current ?? { start: value.length, end: value.length }
    caret.current = { start: start + token.length, end: start + token.length }
    onChange(value.slice(0, start) + token + value.slice(end))
  }
  const fieldProps = {
    id,
    value,
    maxLength,
    onBlur,
    dir: "auto" as const,
    autoComplete: "off",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(e.target.value)
      remember(e.currentTarget)
    },
    onSelect: (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => remember(e.currentTarget),
    onKeyUp: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => remember(e.currentTarget),
    onClick: (e: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => remember(e.currentTarget),
    ...aria,
  }

  return (
    <div className="flex flex-col gap-2">
      {multiline ? <Textarea rows={3} {...fieldProps} /> : <Input {...fieldProps} />}
      <div role="group" aria-label={tokensLabel} className="flex flex-wrap gap-1.5">
        {tokens.map((t) => (
          <Button key={t.token} type="button" variant="outline" size="sm" onClick={() => insert(t.token)}>
            {t.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
