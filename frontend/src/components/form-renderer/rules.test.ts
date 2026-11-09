import { describe, expect, it } from "vitest"
import vectors from "../../../../shared/vectors/form-rules.json"
import type { FormDefinition } from "./definition"
import { applyRules } from "./rules"
import { validateForm, type JsonSchema } from "./validate"

// همان نمونه‌هایی که موتور سرور ساخته (backend/tests/form_vectors.py)؛ قاعده‌ها در مرورگر و سرور یکسان اجرا می‌شوند.
describe("form rules parity with the server", () => {
  const definition = vectors.definition as unknown as FormDefinition
  for (const c of vectors.cases) {
    it(c.name, () => {
      const { state } = applyRules(definition, c.data)
      expect([...state.hidden].sort()).toEqual(c.hidden)
      expect([...state.required].sort()).toEqual(c.required)
      expect([...state.readonly].sort()).toEqual(c.readonly)
      expect(state.calculated).toEqual(c.calculated)
      const schema = (c.partial ? vectors.draft_schema : vectors.schema) as JsonSchema
      expect(validateForm(definition, schema, c.data, c.partial)).toEqual(c.errors)
    })
  }
})
