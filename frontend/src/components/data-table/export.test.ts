import { describe, expect, it } from "vitest"
import { csvCell } from "./export"

describe("csvCell", () => {
  it("متن فرمول‌مانند را بی‌اثر می‌کند", () => {
    expect(csvCell("=1+1")).toBe("'=1+1")
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)")
    expect(csvCell("-cmd")).toBe("'-cmd")
  })
  it("عدد منفی، متن عادی و نقل‌قول را دست نمی‌زند جز قاعده‌ی CSV", () => {
    expect(csvCell("-12.5")).toBe("-12.5")
    expect(csvCell("سارا")).toBe("سارا")
    expect(csvCell('a,"b"')).toBe('"a,""b"""')
    expect(csvCell(null)).toBe("")
  })
})
