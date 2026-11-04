import { useEffect, useRef } from "react";
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";

// نمایش فقط‌خواندنی دیاگرام، با رنگ‌آمیزی مراحل انجام‌شده و جاری
export default function DiagramViewer({ xml, active = [], done = [] }) {
  const ref = useRef(null);
  useEffect(() => {
    const viewer = new NavigatedViewer({ container: ref.current });
    viewer.importXML(xml).then(() => {
      const canvas = viewer.get("canvas");
      const reg = viewer.get("elementRegistry");
      done.forEach((id) => reg.get(id) && canvas.addMarker(id, "hl-done"));
      active.forEach((id) => reg.get(id) && canvas.addMarker(id, "hl-active"));
      canvas.zoom("fit-viewport", "auto");
    }).catch(() => {});
    return () => viewer.destroy();
  }, [xml, active.join(), done.join()]);
  return <div className="viewer" ref={ref} />;
}
