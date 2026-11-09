import type * as React from "react"
import { useDraggable } from "@dnd-kit/core"
import {
  AlignJustify,
  Banknote,
  Calendar,
  CalendarClock,
  CalendarRange,
  CheckSquare,
  CircleDot,
  Clock,
  Contact,
  CreditCard,
  FileSignature,
  FileText,
  Grid3x3,
  Hash,
  Heading,
  IdCard,
  Landmark,
  List,
  Mail,
  MapPin,
  Minus,
  Network,
  Paperclip,
  PenLine,
  Phone,
  Smartphone,
  Star,
  ToggleLeft,
  Type,
  UserRound,
  UserSquare,
  Users,
  CarFront,
  BadgeCheck,
  Building,
  Briefcase,
  Pilcrow,
  Timer,
  Blocks,
  Calculator,
  type LucideIcon,
} from "lucide-react"
import { BLOCKS, type FieldTypeSpec } from "./designer-model"

const ICONS: Record<string, LucideIcon> = {
  heading: Heading,
  paragraph: Pilcrow,
  divider: Minus,
  text: Type,
  textarea: AlignJustify,
  number: Hash,
  amount: Banknote,
  date: Calendar,
  time: Clock,
  date_range: CalendarRange,
  datetime: CalendarClock,
  time_range: Timer,
  boolean: ToggleLeft,
  choice: CircleDot,
  multi_choice: CheckSquare,
  scale: Star,
  matrix: Grid3x3,
  consent: BadgeCheck,
  national_code: IdCard,
  legal_national_id: Building,
  economic_code: Landmark,
  registration_number: FileText,
  mobile: Smartphone,
  phone: Phone,
  postal_code: MapPin,
  iban: Landmark,
  card_number: CreditCard,
  email: Mail,
  vehicle_plate: CarFront,
  lookup: List,
  user: UserRound,
  org_unit: Network,
  position: Briefcase,
  region: MapPin,
  submitter: UserSquare,
  attachment: Paperclip,
  signature: FileSignature,
  signature_pad: PenLine,
  calculated: Calculator,
}
const BLOCK_ICONS: Record<string, LucideIcon> = { personal: Contact, contact: Phone, address: MapPin, bank: Landmark }

/** نوع‌هایی که هنوز نمایش ندارند (جدول در 3.6) در جعبه‌ابزار نمی‌آیند. */
const HIDDEN = new Set(["table"])

type Props = {
  specs: FieldTypeSpec[]
  onAdd: (code: string) => void
  onAddBlock: (key: string) => void
  /** کشیدن نوع‌ها روی بوم (فقط وقتی جعبه‌ابزار کنار بوم است). */
  draggable?: boolean
  disabled?: boolean
}

/** جعبه‌ابزار: نوع‌ها به تفکیک گروه و بلوک‌های آماده؛ با کلیک به بخش انتخاب‌شده اضافه می‌شوند یا روی بوم کشیده می‌شوند. */
export function Toolbox({ specs, onAdd, onAddBlock, draggable, disabled }: Props) {
  const groups = new Map<string, FieldTypeSpec[]>()
  for (const s of specs) if (!HIDDEN.has(s.code)) groups.set(s.group, [...(groups.get(s.group) ?? []), s])
  return (
    <div className="flex flex-col gap-3 p-3">
      <ToolGroup title="بلوک‌های آماده" icon={Blocks}>
        {BLOCKS.map((b) => (
          <ToolButton key={b.key} id={`block:${b.key}`} label={b.title} icon={BLOCK_ICONS[b.key]} onClick={() => onAddBlock(b.key)} draggable={draggable} disabled={disabled} />
        ))}
      </ToolGroup>
      {[...groups.entries()].map(([group, items]) => (
        <ToolGroup key={group} title={group}>
          {items.map((s) => (
            <ToolButton key={s.code} id={`new:${s.code}`} label={s.title} icon={ICONS[s.code] ?? Users} onClick={() => onAdd(s.code)} draggable={draggable} disabled={disabled} />
          ))}
        </ToolGroup>
      ))}
    </div>
  )
}

function ToolGroup({ title, icon: Icon, children }: { title: string; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <h3 className="flex items-center gap-1 text-2xs font-semibold text-muted-foreground">
        {Icon && <Icon className="size-3" aria-hidden />}
        {title}
      </h3>
      <ul className="grid grid-cols-2 gap-1">{children}</ul>
    </section>
  )
}

function ToolButton({ id, label, icon: Icon, onClick, draggable, disabled }: { id: string; label: string; icon: LucideIcon; onClick: () => void; draggable?: boolean; disabled?: boolean }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id, disabled: !draggable || disabled, data: { label } })
  return (
    <li>
      <button
        ref={setNodeRef}
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-label={`افزودن «${label}»`}
        // فقط کشیدن با نشانگر؛ Enter و Space روی دکمه همان «افزودن» است (نه شروع کشیدن با صفحه‌کلید).
        onPointerDown={draggable ? (listeners?.onPointerDown as React.PointerEventHandler<HTMLButtonElement> | undefined) : undefined}
        className="flex min-h-8 w-full items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-start text-2xs hover:border-primary hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50 data-[dragging=true]:opacity-50"
        data-dragging={isDragging}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{label}</span>
      </button>
    </li>
  )
}
