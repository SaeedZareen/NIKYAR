import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router/dom"
import { QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "@/components/theme-provider"
import { DirectionProvider } from "@/components/ui/direction"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { queryClient } from "@/app/query-client"
import { router } from "@/app/router"
import { trackActivity } from "@/lib/activity"
import { registerPwa } from "@/lib/pwa"
import "./index.css"

trackActivity()
registerPwa()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DirectionProvider dir="rtl">
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={400}>
            <RouterProvider router={router} />
            <Toaster position="bottom-left" richColors closeButton dir="rtl" />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </DirectionProvider>
  </StrictMode>
)
