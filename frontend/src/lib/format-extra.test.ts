import { describe, expect, it } from "vitest"
import { bankFromCard, bankFromIban } from "@/lib/banks"
import { formatDuration, numberToWords } from "@/lib/format"

describe("amount in words", () => {
  it("writes Persian cheque-style words", () => {
    expect(numberToWords(0)).toBe("صفر")
    expect(numberToWords(15)).toBe("پانزده")
    expect(numberToWords(121)).toBe("یکصد و بیست و یک")
    expect(numberToWords(2_500_000)).toBe("دو میلیون و پانصد هزار")
    expect(numberToWords(1_001_000)).toBe("یک میلیون و یک هزار")
    expect(numberToWords(30_000_000_000)).toBe("سی میلیارد")
  })
})

describe("duration and banks", () => {
  it("formats durations", () => {
    expect(formatDuration(270)).toBe("۴ ساعت و ۳۰ دقیقه")
    expect(formatDuration(45)).toBe("۴۵ دقیقه")
    expect(formatDuration(120)).toBe("۲ ساعت")
  })
  it("detects banks", () => {
    expect(bankFromIban("IR820540102680020817909002")).toBe("بانک پارسیان")
    expect(bankFromIban("IR062960000000100324200001")).toBeUndefined()
    expect(bankFromCard("6037997599421782")).toBe("بانک ملی ایران")
    expect(bankFromCard("6219")).toBeUndefined()
  })
})
