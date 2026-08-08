"use client";

import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { TabBar } from "@/components/nav/TabBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useT();

  // /chat is a focused, full-screen conversation surface — hiding the tab
  // bar there avoids fighting its own height calc against a fixed bottom
  // bar, and mirrors how iOS apps treat a "conversation" as its own stack.
  const hideTabBar = pathname?.startsWith("/chat");

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (!user.profile?.onboarded_at) { router.replace("/onboarding"); return; }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-mint-500 border-t-transparent" />
          <p className="text-sm text-text-muted">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex flex-col min-h-screen bg-bg-primary">
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      {!hideTabBar && <TabBar />}
    </div>
  );
}
