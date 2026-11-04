import * as React from "react";
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";

/** نمایش فقط‌خواندنی دیاگرام با رنگ‌آمیزی مراحل انجام‌شده و جاری */
export function DiagramViewer({ xml, active = [], done = [] }: { xml: string; active?: string[]; done?: string[] }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const a = active.join(), d = done.join();
  React.useEffect(() => {
    const viewer = new NavigatedViewer({ container: ref.current! });
    viewer.importXML(xml).then(() => {
      const canvas = viewer.get("canvas") as { addMarker: (id: string, c: string) => void; zoom: (v: string, c: string) => void };
      const reg = viewer.get("elementRegistry") as { get: (id: string) => unknown };
      done.forEach((id) => reg.get(id) && canvas.addMarker(id, "hl-done"));
      active.forEach((id) => reg.get(id) && canvas.addMarker(id, "hl-active"));
      canvas.zoom("fit-viewport", "auto");
    }).catch(() => {});
    return () => viewer.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xml, a, d]);
  return <div ref={ref} dir="ltr" className="bpmn-surface h-96 w-full" aria-label="نقشه‌ی فرایند" />;
}
