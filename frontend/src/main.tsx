import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router/dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "@/components/theme-provider"
import { DirectionProvider } from "@/components/ui/direction"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { router } from "@/app/router"
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

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
