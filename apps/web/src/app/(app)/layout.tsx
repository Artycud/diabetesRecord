"use client";

import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { TabBar } from "@/components/nav/TabBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useT();

  // /chat is a focused, full-screen conversation surface — hiding the tab
  // bar there avoids fighting its own height calc against a fixed bottom
  // bar, and mirrors how iOS apps treat a "conversation" as its own stack.
  // /admin and /doctor are their own consoles with no bottom-tab concept.
  const hideTabBar = pathname?.startsWith("/chat")
    || pathname?.startsWith("/admin")
    || pathname?.startsWith("/doctor");

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (!user.profile?.onboarded_at) { router.replace("/onboarding"); return; }
    // Doctor accounts don't have a personal patient Home — land them on
    // their patient roster instead. Scoped to just the /home entry point so
    // a doctor can still reach /me normally (settings, logout, etc.).
    if (user.role === "doctor" && pathname === "/home") { router.replace("/doctor"); return; }
  }, [user, loading, router, pathname]);

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
        {/* Opacity-only fade on navigation, keyed by pathname (never search
            params — /chat's ?q=/?device= deep-link flow relies on in-place
            param updates without a remount). Deliberately no
            AnimatePresence/exit animation: Home/Breathing/Trends all open a
            live WebSocket + fire queries on mount, and holding the old page
            mounted during an exit transition would delay the new page's
            connection — a keyed remount unmounts the old page instantly and
            starts the new page's fetches immediately, only the entrance
            fades in. Deliberately opacity-only, never x/y/scale: several
            components mounted on the Breathing screen (PreBlowChecklist,
            ContextSelector) render fixed inset-0 overlays without a portal,
            and a non-none transform on an ancestor becomes the containing
            block for position:fixed descendants per the CSS spec — a
            transform here would mis-position those overlays live. */}
        <motion.div
          key={pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      </main>
      {!hideTabBar && <TabBar />}
    </div>
  );
}
