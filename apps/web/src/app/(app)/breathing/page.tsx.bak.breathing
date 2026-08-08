"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDeviceStream } from "@/lib/useDeviceStream";
import Link from "next/link";
import { Wind, ChevronRight, Settings, BarChart2, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import UrineKetoneLogger from "@/components/UrineKetoneLogger";

const LABEL_TH: Record<string, string> = {
  clean: "อากาศสะอาด",
  low: "ต่ำ",
  moderate: "ปานกลาง",
  high: "สูง",
  unreliable: "ไม่แน่ใจ",
};

const LABEL_COLOR: Record<string, string> = {
  clean: "text-sky-400",
  low: "text-mint-500",
  moderate: "text-amber-400",
  high: "text-red-400",
  unreliable: "text-text-muted",
};

export default function BreathingPage() {
  const { user } = useAuth();
  const { t } = useT();
  const queryClient = useQueryClient();
  const { reading: liveReading } = useDeviceStream(user?.id);

  // "Connected" = actually receiving data (last reading < 60s), not just WS open
  const connected = !!liveReading &&
    (Date.now() - new Date(liveReading.time).getTime() < 60_000);

  const { data: devices } = useQuery({
    queryKey: ["sensor", "devices"],
    queryFn: api.sensor.listDevices,
  });

  const primaryDevice = devices?.[0];

  const { data: readings } = useQuery({
    queryKey: ["sensor", "readings", primaryDevice?.id],
    queryFn: () => api.sensor.getReadings(primaryDevice!.id, 7),
    enabled: !!primaryDevice,
  });

  const recentReadings = (readings ?? []).slice(-10).reverse();

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-24 space-y-5">
      {/* Device status */}
      <div className="bg-bg-elevated rounded-2xl p-4">
        {primaryDevice ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">{primaryDevice.sensor_model ?? "MetaBreath TGS1820"}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <div className={`h-2 w-2 rounded-full ${connected ? "bg-mint-500 animate-pulse" : "bg-text-disabled"}`} />
                <p className="text-xs text-text-muted">{connected ? "Connected · Live" : "Disconnected"}</p>
              </div>
            </div>
            <Link href={`/me/device/${primaryDevice.id}/settings`} className="h-9 w-9 rounded-xl bg-bg-raised flex items-center justify-center">
              <Settings size={16} className="text-text-muted" />
            </Link>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-muted">{t("breathing.noDevice")}</p>
            <Link href="/me/device/add" className="text-xs text-mint-500 font-medium">{t("breathing.addDevice")}</Link>
          </div>
        )}
      </div>

      {/* Start session CTA */}
      <div className="flex flex-col items-center py-8">
        <button
          onClick={() => {
            if (!connected) {
              toast.error(t("breathing.toastDisconnected"), {
                description: t("breathing.toastDisconnectedDesc"),
                action: { label: t("breathing.goToDevice"), onClick: () => window.location.href = "/me/device" },
              });
              return;
            }
            toast.info(t("breathing.toastStarted"));
          }}
          className="h-28 w-28 rounded-full bg-mint-500/10 border-2 border-mint-500/40 flex flex-col items-center justify-center gap-2 hover:bg-mint-500/20 active:scale-95 transition-all duration-200"
        >
          <Wind size={32} className={connected ? "text-mint-500" : "text-text-muted"} strokeWidth={1.6} />
          <span className={`text-xs font-semibold uppercase tracking-wide ${connected ? "text-mint-500" : "text-text-muted"}`}>{t("breathing.startSession")}</span>
        </button>
        <p className="text-xs text-text-muted mt-4">
          {connected ? t("breathing.tapToStart") : t("breathing.connectFirst")}
        </p>
      </div>

      {/* Quick actions */}
      {primaryDevice && (
        <div className="grid grid-cols-3 gap-3">
          <Link href={`/me/device/${primaryDevice.id}/calibrate`} className="bg-bg-elevated rounded-xl p-3 flex flex-col items-center gap-1.5 hover:bg-bg-raised transition-colors">
            <FlaskConical size={18} className="text-mint-500" strokeWidth={1.6} />
            <span className="text-xs text-text-muted">{t("breathing.calibrate")}</span>
          </Link>
          <Link href={`/me/device/${primaryDevice.id}/report`} className="bg-bg-elevated rounded-xl p-3 flex flex-col items-center gap-1.5 hover:bg-bg-raised transition-colors">
            <BarChart2 size={18} className="text-blue-400" strokeWidth={1.6} />
            <span className="text-xs text-text-muted">{t("breathing.report")}</span>
          </Link>
          <Link href="/trends" className="bg-bg-elevated rounded-xl p-3 flex flex-col items-center gap-1.5 hover:bg-bg-raised transition-colors">
            <ChevronRight size={18} className="text-text-muted" strokeWidth={1.6} />
            <span className="text-xs text-text-muted">{t("breathing.trend")}</span>
          </Link>
        </div>
      )}

      {/* Urine ketone reference (ground truth for breath↔urine agreement) */}
      <UrineKetoneLogger
        onLogged={() => queryClient.invalidateQueries({ queryKey: ["logs", "ketone"] })}
      />

      {/* Recent sessions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">{t("breathing.recentSessions")}</p>
        </div>

        {recentReadings.length === 0 ? (
          <div className="bg-bg-elevated rounded-2xl p-6 text-center">
            <p className="text-sm text-text-muted">{t("breathing.noHistory")}</p>
            <p className="text-xs text-text-disabled mt-1">{t("breathing.noHistorySub")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentReadings.map((r, idx) => (
              <div key={r.time + idx} className="bg-bg-elevated rounded-2xl p-4 flex items-center gap-3">
                <div className="w-14 text-right">
                  <p className="text-xs text-text-muted">
                    {new Date(r.time).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-[10px] text-text-disabled mt-0.5">
                    {new Date(r.time).toLocaleDateString("th-TH", { month: "short", day: "numeric" })}
                  </p>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text-primary">
                    {r.acetone_delta?.toFixed(0) ?? "—"} mV
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {r.pressure_mean != null && `${r.pressure_mean.toFixed(2)} kPa`}
                    {r.pressure_mean != null && r.quality_score != null && " · "}
                    {r.quality_score ? `Q: ${r.quality_score.toFixed(0)}/100` : ""}
                  </p>
                </div>
                {r.label && (
                  <span className={`text-xs font-semibold ${LABEL_COLOR[r.label] ?? "text-text-muted"}`}>
                    {LABEL_TH[r.label] ?? r.label}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
