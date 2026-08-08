"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { TIMEZONE_OPTIONS, useTimezone } from "@/lib/timezone";
import { twMerge } from "tailwind-merge";

export default function TimezoneSettingsPage() {
  const router = useRouter();
  const { timezone, setTimezone, formatDateTime } = useTimezone();
  const nowIso = new Date().toISOString();

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-24 space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="h-9 w-9 rounded-full bg-bg-elevated flex items-center justify-center"
        >
          <ArrowLeft size={18} className="text-text-muted" />
        </button>
        <h1 className="text-lg font-semibold text-text-primary">เขตเวลา (Timezone)</h1>
      </div>

      <p className="text-sm text-text-muted leading-relaxed">
        เลือกเขตเวลาที่ใช้แสดงเวลาในทุกหน้าของแอป — Trends, Recent Sessions, ประวัติการวัด และอื่น ๆ
        จะเปลี่ยนตามอัตโนมัติ
      </p>

      <div className="bg-mint-500/10 border border-mint-500/30 rounded-2xl p-4">
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest mb-1.5">
          เวลาปัจจุบันในเขตเวลานี้
        </p>
        <p className="text-lg font-semibold text-mint-500 font-mono">
          {formatDateTime(nowIso, {
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </p>
      </div>

      <div className="space-y-2">
        {TIMEZONE_OPTIONS.map((opt) => {
          const active = timezone === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setTimezone(opt.value)}
              className={twMerge(
                "w-full text-left rounded-2xl border p-4 transition-colors flex items-center gap-3",
                active
                  ? "border-mint-500 bg-mint-500/10"
                  : "border-border-soft bg-bg-elevated hover:border-border-strong",
              )}
            >
              <div
                className={twMerge(
                  "h-6 w-6 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                  active ? "border-mint-500 bg-mint-500" : "border-border-strong",
                )}
              >
                {active && <Check size={14} className="text-white" strokeWidth={3} />}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={twMerge(
                    "text-sm font-medium",
                    active ? "text-mint-500" : "text-text-primary",
                  )}
                >
                  {opt.label}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="bg-bg-elevated rounded-2xl p-4">
        <p className="text-xs text-text-muted leading-relaxed">
          หมายเหตุ: เซิร์ฟเวอร์เก็บทุก timestamp เป็น UTC — การเปลี่ยนเขตเวลาแค่เปลี่ยนวิธีแสดงผลใน browser
          ไม่กระทบข้อมูลใน database
        </p>
      </div>
    </div>
  );
}
