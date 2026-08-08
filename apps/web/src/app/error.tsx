"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

// Root-level error boundary — catches anything thrown by a page/segment
// below the root layout (Providers etc. above this are still mounted, so
// this stays visually consistent with the rest of the app). Kept
// deliberately simple/self-contained: an error boundary that itself throws
// defeats the point.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[RootError]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-primary px-6 text-center">
      <div className="h-14 w-14 rounded-full bg-bg-elevated flex items-center justify-center">
        <AlertTriangle size={26} className="text-peach-500" strokeWidth={1.8} />
      </div>
      <div>
        <p className="text-base font-semibold text-text-primary">เกิดข้อผิดพลาดบางอย่าง</p>
        <p className="text-sm text-text-muted mt-1">ลองใหม่อีกครั้ง หากยังไม่หายให้รีเฟรชหน้า</p>
      </div>
      <button
        onClick={reset}
        className="btn-premium flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white active:scale-95 transition-transform"
      >
        <RefreshCw size={14} />
        ลองใหม่
      </button>
    </div>
  );
}
