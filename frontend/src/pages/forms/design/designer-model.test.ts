import { describe, expect, it } from "vitest"
import { itemsOf, type FormDefinition } from "@/components/form-renderer/definition"
import {
  addSection,
  allIds,
  BLOCKS,
  blockFields,
  commit,
  duplicateField,
  errorsByItem,
  findField,
  fitSpans,
  insertItems,
  locateItem,
  moveTo,
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
    expect(ids(moveTo(def(), "f1", { section: "a", index: 1 }))).toEqual([["f2", "f1"], ["f3"]])
    expect(ids(moveTo(def(), "f1", { section: "b", index: 0 }))).toEqual([["f2"], ["f1", "f3"]])
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

  it("groups: new group, nested items by id, move in and out, errors of items", () => {
    const taken = allIds(def())
    const group = newField({ code: "table", title: "گروه تکرارشونده", label_required: true }, taken)
    expect(group.span).toBe(3)
    const [i1, i2] = itemsOf(group).map((c) => c.id)
    let d = fitSpans({ ...def(), sections: [{ ...def().sections[0], fields: [...def().sections[0].fields, group] }, def().sections[1]] })
    expect(findField(d, group.id)?.span).toBe(2)
    expect(allIds(d).has(i2)).toBe(true)
    // نوار ابزار فیلدِ درون گروه: جابه‌جایی، رونوشت، حذف
    expect(locateItem(nudgeField(d, i1, 1), i1)).toEqual({ group: group.id, index: 1 })
    const dup = duplicateField(d, i1)
    expect(locateItem(dup.def, dup.id)).toEqual({ group: group.id, index: 1 })
    expect(locateItem(removeField(d, i1), i2)).toEqual({ group: group.id, index: 0 })
    // فیلد بخش به گروه می‌رود و ویژگی‌های چیدمانش برداشته می‌شود؛ و برمی‌گردد
    d = moveTo({ ...d, sections: d.sections.map((s) => ({ ...s, fields: s.fields.map((f) => (f.id === "f1" ? { ...f, span: 2, visible_if: true } : f)) })) }, "f1", { group: group.id, index: 0 })
    expect(locateItem(d, "f1")).toEqual({ group: group.id, index: 0 })
    expect(findField(d, "f1")).toEqual({ id: "f1", type: "text", label: "۱" })
    d = moveTo(d, "f1", { section: "b", index: 0 })
    expect(ids(d)[1]).toEqual(["f1", "f3"])
    expect(locateItem(insertItems(d, group.id, [{ id: "x", type: "text" }], 0), "x")).toEqual({ group: group.id, index: 0 })
    expect(errorsByItem(d, { "sections.0.fields.1.props.columns.1.label": "برچسب", "sections.0.fields.1.props.columns": "ستون" })).toEqual({
      [i2]: { label: "برچسب" },
      [group.id]: { "props.columns": "ستون" },
    })
  })
})
