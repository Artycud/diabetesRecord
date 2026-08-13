"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Cpu, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useUnits } from "@/lib/units";
import type { LiveReading } from "@/lib/useDeviceStream";

interface Props {
  deviceId: string | null | undefined;
  liveConnected: boolean;
  liveReading: LiveReading | null | undefined;
}

// Only one real pairing method exists against current firmware: manual MAC
// entry at /me/device/add. The BLE flow at /me/device/pair is dead code —
// firmware dropped BLE GATT provisioning entirely in favor of a WiFiManager
// captive-portal AP (per bug.md's 2026-08-08 reconciliation), so no ESP32
// advertises that BLE service anymore. Linking to it would be a silent dead
// end, not a working "scan" action.
const actions = [
  { href: "/me/device/add", icon: Cpu, label: "Add device" },
];

/**
 * Turns the previously-inert device-status row (dot + text) into a tappable
 * trigger for pairing actions. Portaled like InfoButton — this trigger is a
 * full-width row inside the hero Card, so an anchored dropdown risks
 * overflow on narrow viewports; a sheet doesn't have that problem.
 */
export function DeviceStatusSheet({ deviceId, liveConnected, liveReading }: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useT();
  const { format: fmtAcetone, label: unitLbl } = useUnits();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full px-1 -mx-1 py-0.5 hover:bg-bg-raised transition-colors"
      >
        <div className={`h-2 w-2 rounded-full ${liveConnected ? "bg-mint-500 animate-pulse" : "bg-text-disabled"}`} />
        <span className="text-xs text-text-muted">
          {liveConnected ? (
            <>Live · MetaBreath {liveReading && `(${fmtAcetone(liveReading.acetone_delta_mv)} ${unitLbl})`}</>
          ) : deviceId ? (
            <>{t("health.connectDevice") ?? "อุปกรณ์ไม่ได้เชื่อมต่อ"}</>
          ) : (
            <span className="text-mint-500">{t("health.connectDevice")}</span>
          )}
        </span>
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

          <div className="relative w-full max-w-md bg-bg-surface rounded-t-3xl sm:rounded-3xl pb-8 px-5 pt-5">
            <div className="w-10 h-1 bg-border-subtle rounded-full mx-auto mb-4 sm:hidden shrink-0" />

            <div className="flex items-start justify-between mb-3 gap-3">
              <h2 className="text-base font-semibold text-text-primary leading-snug">Device</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 -mr-1.5 rounded-xl text-text-muted hover:text-text-primary transition-colors shrink-0"
                aria-label="ปิด"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1">
              {actions.map(({ href, icon: Icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-2 py-3 rounded-xl text-sm text-text-primary hover:bg-bg-raised transition-colors"
                >
                  <Icon size={16} strokeWidth={1.6} className="text-mint-500" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
