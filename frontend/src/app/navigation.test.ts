import { describe, expect, it } from "vitest"
import { activeUrl } from "./navigation"

describe("مورد فعال منو", () => {
  it("دقیق‌ترین پیوند، نه هر پیشوند", () => {
    expect(activeUrl("/forms/design")).toBe("/forms/design")
    expect(activeUrl("/forms/design/12")).toBe("/forms/design")
    expect(activeUrl("/forms")).toBe("/forms")
    expect(activeUrl("/forms/12/fill")).toBe("/forms")
    expect(activeUrl("/")).toBe("/")
    expect(activeUrl("/formsx")).toBeUndefined()
    expect(activeUrl("/admin/users")).toBe("/admin/users")
  })
})
