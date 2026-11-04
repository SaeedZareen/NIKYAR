// داده‌های مرجع فرم (فهرست‌های پایه، کاربران، واحدها) با کش مشترک
import { useQuery } from "@tanstack/react-query";
import { get } from "@/app/api";

export type LookupOption = { code: string; title: string; is_active: boolean; parent: number | null; id: number };

export function useLookupBundle(codes: string[]) {
  const key = [...codes].sort().join(",");
  return useQuery({
    queryKey: ["lookup-bundle", key],
    queryFn: () => get<Record<string, LookupOption[]>>(`/lookups/types/bundle/?codes=${key}`),
    enabled: codes.length > 0,
    staleTime: 60_000,
  });
}

export function useUsersBrief(enabled = true) {
  return useQuery({
    queryKey: ["users-brief"], enabled, staleTime: 60_000,
    queryFn: () => get<{ id: number; username: string; full_name: string }[]>("/users/brief/"),
  });
}

export function useUnits(enabled = true) {
  return useQuery({
    queryKey: ["org-units"], enabled, staleTime: 60_000,
    queryFn: () => get<{ id: number; code: string; title: string; parent: number | null; positions: { id: number; code: string; title: string; holder_name: string; is_manager: boolean }[] }[]>("/org/units/"),
  });
}
