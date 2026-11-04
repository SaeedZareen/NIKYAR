// افزودن «تسک کاربری» مستقیم به نوار ابزار (پرکاربردترین عنصر در فرایندهای اداری)
function UserTaskPalette(palette, create, elementFactory, translate) {
  palette.registerProvider(this);
  this.getPaletteEntries = () => ({
    "create.user-task": {
      group: "activity",
      className: "bpmn-icon-user-task",
      title: "تسک کاربری (کار اداری)",
      action: {
        dragstart: (e) => create.start(e, elementFactory.createShape({ type: "bpmn:UserTask" })),
        click: (e) => create.start(e, elementFactory.createShape({ type: "bpmn:UserTask" })),
      },
    },
  });
}
UserTaskPalette.$inject = ["palette", "create", "elementFactory", "translate"];

export default { __init__: ["userTaskPalette"], userTaskPalette: ["type", UserTaskPalette] };
