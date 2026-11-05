import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query"
import { ApiError } from "@/lib/api/client"
import { SESSION_KEY } from "./auth"

/** پایان نشست در هر درخواستی (مثلاً پس از خاموش‌شدن سرور یا گذشت زمان) کاربر را به صفحه‌ی ورود می‌برد. */
function onError(error: unknown) {
  if (error instanceof ApiError && error.code === "not_authenticated") queryClient.setQueryData(SESSION_KEY, null)
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: (count, e) => count < 1 && !(e instanceof ApiError && e.status < 500 && e.status > 0) },
  },
})
