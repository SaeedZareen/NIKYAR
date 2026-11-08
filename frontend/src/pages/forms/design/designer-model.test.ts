import { describe, expect, it } from "vitest"
import type { FormDefinition } from "@/components/form-renderer/definition"
import {
  addSection,
  allIds,
  BLOCKS,
  blockFields,
  commit,
  duplicateField,
  errorsByItem,
  fitSpans,
  moveField,
  newField,
  nudgeField,
  redo,
  removeField,
  undo,
  uniqueId,
} from "./designer-model"

const def = (): FormDefinition => ({
  sections: [
    { id: "a", title: "الف", columns: 2, fields: [{ id: "f1", type: "text", label: "۱" }, { id: "f2", type: "text", label: "۲" }] },
    { id: "b", title: "ب", columns: 1, fields: [{ id: "f3", type: "text", label: "۳" }] },
  ],
})
const ids = (d: FormDefinition) => d.sections.map((s) => s.fields.map((f) => f.id))

describe("designer model", () => {
  it("creates unique ids and valid new fields", () => {
    const taken = new Set(["text_1"])
    expect(uniqueId("text", taken)).toBe("text_2")
    expect(taken.has("text_2")).toBe(true)
    const choice = newField({ code: "choice", title: "انتخاب یکی", label_required: true }, new Set())
    expect(choice).toMatchObject({ id: "choice_1", label: "انتخاب یکی" })
    expect(choice.props!.options as unknown[]).toHaveLength(2)
    expect(newField({ code: "divider", title: "جداکننده", label_required: false }, new Set()).label).toBeUndefined()
  })

  it("moves, nudges across sections, duplicates and removes", () => {
    expect(ids(moveField(def(), "f1", "a", 1))).toEqual([["f2", "f1"], ["f3"]])
    expect(ids(moveField(def(), "f1", "b", 0))).toEqual([["f2"], ["f1", "f3"]])
    expect(ids(nudgeField(def(), "f2", 1))).toEqual([["f1"], ["f2", "f3"]])
    expect(ids(nudgeField(def(), "f3", -1))).toEqual([["f1", "f2", "f3"], []])
    const { def: d, id } = duplicateField(def(), "f1")
    expect(ids(d)).toEqual([["f1", id, "f2"], ["f3"]])
    expect(ids(removeField(def(), "f2"))).toEqual([["f1"], ["f3"]])
  })

  it("adds blocks with unique ids and fits spans to section columns", () => {
    const d = def()
    const fields = blockFields(BLOCKS.find((b) => b.key === "address")!, allIds(d))
    expect(fields.map((f) => f.type)).toEqual(["region", "postal_code", "textarea"])
    const one = { sections: [{ id: "s", columns: 1, fields }] }
    expect(fitSpans(one).sections[0].fields[2].span).toBeUndefined()
    const two = { sections: [{ id: "s", columns: 2, fields }] }
    expect(fitSpans(two).sections[0].fields[2].span).toBe(2)
    expect(addSection(d).def.sections).toHaveLength(3)
  })

  it("undo/redo with merged typing", () => {
    let h = { past: [], present: def(), future: [] } as Parameters<typeof commit>[0]
    const a = { ...def(), sections: [] }
    h = commit(h, a, "label:f1", 1000)
    const b = { ...a }
    h = commit(h, b, "label:f1", 1500)
    expect(h.past).toHaveLength(1)
    h = undo(h)
    expect(ids(h.present)).toEqual(ids(def()))
    h = redo(h)
    expect(h.present).toBe(b)
  })

  it("maps server errors to fields and sections", () => {
    const e = errorsByItem(def(), { "sections.0.fields.1.props.max": "بیشینه", "sections.1.title": "عنوان", definition: "کلی" })
    expect(e).toEqual({ f2: { "props.max": "بیشینه" }, b: { title: "عنوان" }, form: { definition: "کلی" } })
  })
})
