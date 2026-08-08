"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

// Scoped to the authenticated app shell — (app)/layout.tsx (nav, auth guard)
// still renders around this, only the failing page/segment below it is
// replaced. Same fallback pattern as the root error.tsx, plus a way back to
// /home in case `reset()` alone can't recover (e.g. a bad route param).
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[AppError]", error);
  }, [error]);

  return (
    <div className="max-w-md mx-auto px-4 pt-16 pb-24 flex flex-col items-center text-center gap-4">
      <div className="h-14 w-14 rounded-full bg-bg-elevated flex items-center justify-center">
        <AlertTriangle size={26} className="text-peach-500" strokeWidth={1.8} />
      </div>
      <div>
        <p className="text-base font-semibold text-text-primary">โหลดหน้านี้ไม่สำเร็จ</p>
        <p className="text-sm text-text-muted mt-1">มีบางอย่างผิดพลาด ลองใหม่อีกครั้ง</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={reset}
          className="bg-mint-500 hover:bg-mint-600 flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white active:scale-95 transition-transform"
        >
          <RefreshCw size={14} />
          ลองใหม่
        </button>
        <Link
          href="/home"
          className="flex items-center gap-2 rounded-xl border border-border-soft px-5 py-2.5 text-sm text-text-muted hover:bg-bg-raised transition-colors"
        >
          <Home size={14} />
          หน้าแรก
        </Link>
      </div>
    </div>
  );
}
