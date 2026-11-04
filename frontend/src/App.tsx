import * as React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/app/auth";
import { Shell } from "@/app/Shell";
import { MODULES } from "@/app/modules";
import { LoadingBlock } from "@/app/ui";
import LoginPage from "@/core/system/LoginPage";

function Guard({ perm, module, children }: { perm?: string; module: string; children: React.ReactNode }) {
  const { can, moduleEnabled } = useAuth();
  if ((module !== "core" && !moduleEnabled(module)) || !can(perm)) {
    return <EmptyState icon={ShieldAlert} title="دسترسی ندارید" description="برای این بخش مجوز لازم را ندارید. با مدیر سامانه تماس بگیرید." />;
  }
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="mx-auto max-w-xl p-8"><LoadingBlock /></div>;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Shell />}>
        {MODULES.flatMap((m) => m.routes.map((r) => (
          <Route key={r.path} path={r.path}
            element={<Guard perm={r.perm} module={m.code}><React.Suspense fallback={<LoadingBlock />}>{r.element}</React.Suspense></Guard>} />
        )))}
        <Route path="*" element={<EmptyState title="صفحه پیدا نشد" description="نشانی واردشده در سامانه وجود ندارد." />} />
      </Route>
    </Routes>
  );
}
