// تعریف moddle برای عنصرهای افزوده‌ی SpiffWorkflow تا bpmn-js آن‌ها را بخواند، نگه دارد و با واگرد بسازد.
export const spiffworkflowModdle = {
  name: "SpiffWorkflow",
  prefix: "spiffworkflow",
  uri: "http://spiffworkflow.org/bpmn/schema/1.0/core",
  xml: { tagAlias: "lowerCase" },
  associations: [],
  types: [
    { name: "Properties", superClass: ["Element"], properties: [{ name: "properties", type: "Property", isMany: true }] },
    {
      name: "Property",
      superClass: ["Element"],
      properties: [
        { name: "name", type: "String", isAttr: true },
        { name: "value", type: "String", isAttr: true },
      ],
    },
    { name: "ServiceTaskOperator", superClass: ["Element"], properties: [{ name: "id", type: "String", isAttr: true }] },
  ],
}
