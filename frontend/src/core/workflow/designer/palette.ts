// «تسک کاربری» و «اقدام سیستمی» مستقیم در نوار ابزار
/* eslint-disable @typescript-eslint/no-explicit-any */
function NikyarPalette(this: any, palette: any, create: any, elementFactory: any) {
  palette.registerProvider(this);
  const entry = (type: string, className: string, title: string) => ({
    group: "activity", className, title,
    action: {
      dragstart: (e: Event) => create.start(e, elementFactory.createShape({ type })),
      click: (e: Event) => create.start(e, elementFactory.createShape({ type })),
    },
  });
  this.getPaletteEntries = () => ({
    "create.user-task": entry("bpmn:UserTask", "bpmn-icon-user-task", "تسک کاربری (کار اداری)"),
    "create.service-task": entry("bpmn:ServiceTask", "bpmn-icon-service-task", "اقدام سیستمی (ماژول‌ها)"),
  });
}
NikyarPalette.$inject = ["palette", "create", "elementFactory"];

export default { __init__: ["nikyarPalette"], nikyarPalette: ["type", NikyarPalette] };
