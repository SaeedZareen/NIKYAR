import { describe, expect, it } from "vitest"
import { formatDate, formatMoney, formatNumber, parseJalali, toEnDigits, toFaDigits, toJalaliString } from "@/lib/format"
import {
  isValidCardNumber,
  isValidIban,
  isValidMobile,
  isValidNationalId,
  isValidPostalCode,
  normalizeMobile,
  schemas,
} from "@/lib/validators"

describe("format", () => {
  it("converts digits both ways", () => {
    expect(toFaDigits("1405/08/14")).toBe("۱۴۰۵/۰۸/۱۴")
    expect(toEnDigits("۰۹۱۲٣٤٥")).toBe("0912345")
  })
  it("formats numbers and money in Persian", () => {
    expect(formatNumber(12450000)).toBe("۱۲٬۴۵۰٬۰۰۰")
    expect(formatMoney(1500)).toBe("۱٬۵۰۰ تومان")
    expect(formatNumber(null)).toBe("—")
  })
  it("round-trips Jalali API dates", () => {
    const d = parseJalali("1405/08/14")
    expect(d).toBeInstanceOf(Date)
    expect(toJalaliString(d)).toBe("1405/08/14")
    expect(parseJalali("1405/13/40")).toBeUndefined()
    expect(formatDate("1405/08/14")).toBe("۱۴۰۵/۰۸/۱۴")
    expect(formatDate("1405/08/14", "long")).toBe("۱۴ آبان ۱۴۰۵")
  })
})

describe("validators", () => {
  it("national id", () => {
    expect(isValidNationalId("0084575948")).toBe(true)
    expect(isValidNationalId("۰۰۸۴۵۷۵۹۴۸")).toBe(true)
    expect(isValidNationalId("0084575949")).toBe(false)
    expect(isValidNationalId("1111111111")).toBe(false)
  })
  it("mobile", () => {
    expect(isValidMobile("09121234567")).toBe(true)
    expect(normalizeMobile("+98 912 123 4567")).toBe("09121234567")
    expect(isValidMobile("0912123456")).toBe(false)
  })
  it("postal code, card, iban", () => {
    expect(isValidPostalCode("1234567890")).toBe(true)
    expect(isValidCardNumber("6037-9975-9942-1781")).toBe(false)
    expect(isValidCardNumber("6219861034529007")).toBe(true)
    expect(isValidIban("IR062960000000100324200001")).toBe(true)
    expect(isValidIban("IR062960000000100324200002")).toBe(false)
  })
  it("jalali date schema accepts empty or real dates", () => {
    expect(schemas.jalaliDate.safeParse("").success).toBe(true)
    expect(schemas.jalaliDate.safeParse("1405/08/14").success).toBe(true)
    expect(schemas.jalaliDate.safeParse("1405/13/40").success).toBe(false)
    expect(schemas.jalaliDate.safeParse("1405/08").success).toBe(false)
  })
  it("schemas normalize and report Persian messages", () => {
    expect(schemas.mobile.parse("۰۹۱۲ ۱۲۳ ۴۵۶۷")).toBe("09121234567")
    const r = schemas.nationalId.safeParse("123")
    expect(r.success).toBe(false)
    expect(r.error?.issues[0].message).toContain("کد ملی")
  })
})
