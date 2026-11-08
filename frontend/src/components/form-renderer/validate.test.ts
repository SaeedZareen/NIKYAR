import { describe, expect, it } from "vitest"
import vectors from "../../../../shared/vectors/form-validation.json"
import { toPayload, type FormDefinition } from "./definition"
import { validate, type JsonSchema } from "./validate"

// همان نمونه‌هایی که آزمون سرور با موتور واقعی می‌سازد (backend/tests/form_vectors.py)؛ مرورگر و سرور باید یک خطا بدهند.
describe("form validation parity with the server", () => {
  const definition = vectors.definition as FormDefinition
  for (const c of vectors.cases) {
    it(c.name, () => {
      const payload = toPayload(definition, c.data as Record<string, unknown>)
      const schema = (c.partial ? vectors.draft_schema : vectors.schema) as JsonSchema
      expect(validate(schema, payload)).toEqual(c.errors)
      if (c.cleaned) expect(payload).toEqual(c.cleaned)
    })
  }
})
