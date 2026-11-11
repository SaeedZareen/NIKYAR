import * as React from "react"

/**
 * نشانه‌ی الزامی در یک فرم: star (ستاره، پیش‌فرض)، word («(الزامی)»)، optional (بی‌نشان روی الزامی‌ها و «(اختیاری)» روی بقیه).
 * فرم‌ساز آن را برای هر فرم تعیین می‌کند (definition.required_mark).
 */
type RequiredMark = "star" | "word" | "optional"
export const RequiredMarkContext = React.createContext<RequiredMark>("star")

