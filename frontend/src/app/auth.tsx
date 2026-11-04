import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, get, post, tokenStore } from "./api";

export type Me = {
  id: number; username: string; first_name: string; last_name: string; full_name: string; is_superuser: boolean;
  permissions: string[]; positions: { id: number; title: string; unit: string; is_manager: boolean }[];
  theme: "graphite" | "paper"; role_titles: string[];
};
export type ModuleInfo = { code: string; title: string; description: string; is_core: boolean; icon: string; enabled: boolean };
export type SystemInfo = { customer: string; expires: string | null; expired: boolean; max_users: number | null; modules: ModuleInfo[] };

type AuthCtx = {
  user: Me | null;
  system: SystemInfo | null;
  loading: boolean;
  can: (perm?: string | null) => boolean;
  moduleEnabled: (code: string) => boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setTheme: (t: Me["theme"]) => void;
};

const Ctx = React.createContext<AuthCtx | null>(null);

export function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const hasToken = !!tokenStore.get();
  const me = useQuery({ queryKey: ["me"], queryFn: () => get<Me>("/auth/me/"), enabled: hasToken, retry: false });
  const system = useQuery({ queryKey: ["system"], queryFn: () => get<SystemInfo>("/system/"), enabled: !!me.data });

  React.useEffect(() => { if (me.data) applyTheme(me.data.theme); }, [me.data]);

  const value: AuthCtx = {
    user: me.data ?? null,
    system: system.data ?? null,
    loading: hasToken && (me.isLoading || (!!me.data && system.isLoading)),
    can: (perm) => !perm || !!me.data?.is_superuser || !!me.data?.permissions.includes(perm),
    moduleEnabled: (code) => !!system.data?.modules.find((m) => m.code === code)?.enabled,
    async login(username, password) {
      const r = await post<{ token: string; user: Me }>("/auth/login/", { username, password });
      tokenStore.set(r.token);
      qc.setQueryData(["me"], r.user);
      await qc.invalidateQueries();
    },
    async logout() {
      try { await post("/auth/logout/"); } catch { /* */ }
      tokenStore.set(null);
      qc.clear();
      location.href = "/login";
    },
    setTheme(theme) {
      applyTheme(theme);
      api<Me>("/auth/me/", { method: "PATCH", body: { theme } }).then((u) => qc.setQueryData(["me"], u));
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
