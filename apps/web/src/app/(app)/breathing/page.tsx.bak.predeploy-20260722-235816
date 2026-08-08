"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type SharedDeviceOut } from "@/lib/api";
import { parseServerTime } from "@/lib/time";
import { useAuth } from "@/lib/auth";
import { useDeviceStream } from "@/lib/useDeviceStream";
import Link from "next/link";
import { Radio, TrendingUp, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import BreathSession from "@/components/BreathSession";
import { AcetoneZoneCard } from "@/components/cards/AcetoneZoneCard";

export default function BreathingPage() {
  const { user } = useAuth();
  const { t } = useT();
  const { reading: liveReading } = useDeviceStream(user?.id);
  const userId = user?.id;
  // Session history has moved to /trends. We still fetch it here so (a) after each
  // blow we can invalidate the cache for /trends, and (b) the AcetoneZoneCard can
  // show the peak of the most recent session as the "current" value.
  const { data: sessionsData, refetch: refetchSessions } = useQuery({
    queryKey: ["sensor", "sessions", userId],
    queryFn: () => api.sensor.getSessions(30),
    enabled: !!userId,
    refetchInterval: 30_000,
  });
  const lastSessionPeakMv = sessionsData?.[0]?.peak_acetone_delta ?? null;
  // Prefer live reading while a recording is streaming; fall back to last session peak.
  const currentAcetoneMv = liveReading?.acetone_delta_mv ?? lastSessionPeakMv;

  const { data: devices } = useQuery({
    queryKey: ["sensor", "devices"],
    queryFn: api.sensor.listDevices,
  });

  // Shared-device pool — any signed-in user can claim.
  const { data: sharedDevices, refetch: refetchPool } = useQuery({
    queryKey: ["sensor", "shared-devices"],
    queryFn: api.sensor.listSharedDevices,
    refetchInterval: 15_000, // keep claimed_by / expiry fresh
  });

  const ownedDevice = devices?.[0];
  const myClaim = sharedDevices?.find((d) => d.claimed_by_me);
  // Effective primary: owned first, else a shared device I've claimed.
  const primaryDevice = ownedDevice ?? (myClaim ? {
    id: myClaim.id,
    kind: myClaim.kind,
    active: myClaim.active,
    needs_recalibration: myClaim.needs_recalibration,
    last_calibrated_at: null,
    sensor_model: myClaim.sensor_model,
  } : undefined);

  // Poll heartbeat: ESP32 sends every ~3s, backend refreshes 60s TTL.
  // WebSocket live readings only arrive during an active recording session.
  const { data: recStatus } = useQuery({
    queryKey: ["sensor", "recording-status", primaryDevice?.id],
    queryFn:  () => api.sensor.recordingStatus(primaryDevice!.id),
    enabled:  !!primaryDevice?.id,
    refetchInterval: 10_000,
  });
  const connected = recStatus?.online ?? false;

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-24 space-y-5">
      {/* Device status card removed — same info + release button lives on /me/device now.
          Users without any device still see the "Add device" prompt via the empty state below. */}
      {!primaryDevice && (
        <div className="bg-bg-elevated rounded-2xl p-4 flex items-center justify-between">
          <p className="text-sm text-text-muted">{t("breathing.noDevice")}</p>
          <Link href="/me/device/add" className="text-xs text-mint-500 font-medium">{t("breathing.addDevice")}</Link>
        </div>
      )}

      {/* Shared device pool — show only when I don't own AND haven't claimed */}
      {!ownedDevice && !myClaim && sharedDevices && sharedDevices.length > 0 && (
        <div className="bg-bg-elevated rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Radio size={16} className="text-mint-500" strokeWidth={1.6} />
            <p className="text-sm font-semibold text-text-primary">เครื่องที่ใช้ร่วมกันได้</p>
          </div>
          <p className="text-xs text-text-muted -mt-1">กด "ใช้เครื่องนี้" แล้วค่าจากการเป่าจะเข้าบัญชีของคุณทันที (30 นาที)</p>
          <div className="space-y-2">
            {sharedDevices.map((d) => (
              <SharedDeviceCard key={d.id} device={d} onClaimed={() => refetchPool()} />
            ))}
          </div>
        </div>
      )}

      {/* Breath session — START button → 5-second count → result card */}
      <BreathSession
        liveReading={liveReading}
        connected={connected}
        deviceId={primaryDevice?.id ?? null}
        userId={userId}
        onSessionSaved={() => refetchSessions()}
      />

      {/* Metabolic zone — where does the current value sit on the 5-zone ladder */}
      <AcetoneZoneCard currentMv={currentAcetoneMv} live={!!liveReading && connected} />

      {/* Trends shortcut */}
      {primaryDevice && (
        <Link
          href="/trends"
          className="flex items-center gap-3 bg-bg-elevated rounded-2xl p-4 hover:bg-bg-raised transition-colors"
        >
          <div className="h-9 w-9 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <TrendingUp size={16} className="text-blue-400" strokeWidth={1.6} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">{t("breathing.trend") ?? "แนวโน้ม"}</p>
            <p className="text-xs text-text-muted mt-0.5">ดูค่าเฉลี่ยและกราฟย้อนหลัง</p>
          </div>
          <ChevronRight size={14} className="text-text-disabled" />
        </Link>
      )}

      {/* Recent Sessions list removed — session history now lives on /trends
          ("สรุปรายครั้ง" card) which pulls from the server. */}
    </div>
  );
}

// ─── Shared device card ─────────────────────────────────────────────────────
function SharedDeviceCard({
  device,
  onClaimed,
}: {
  device: SharedDeviceOut;
  onClaimed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const online = device.last_seen_at &&
    (Date.now() - parseServerTime(device.last_seen_at).getTime() < 60_000);

  async function handleClaim() {
    setBusy(true);
    try {
      const res = await api.sensor.claimSharedDevice(device.id);
      if (res.displaced_username) {
        toast.success(`ใช้เครื่องนี้ได้แล้ว (${res.displaced_username} ถูกปล่อยอัตโนมัติ)`);
      } else {
        toast.success("ใช้เครื่องนี้ได้แล้ว — เป่าได้เลย");
      }
      onClaimed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "จองเครื่องไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-bg-raised rounded-xl p-3 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full shrink-0 ${online ? "bg-mint-500 animate-pulse" : "bg-text-disabled"}`} />
          <p className="text-sm font-medium text-text-primary truncate">
            {device.sensor_model ?? device.kind}
          </p>
        </div>
        <p className="text-[11px] text-text-muted mt-0.5">
          {device.claimed_by_username
            ? <>กำลังใช้: <span className="font-medium">{device.claimed_by_username}</span></>
            : "ว่าง — ยังไม่มีใครใช้"}
        </p>
      </div>
      <button
        onClick={handleClaim}
        disabled={busy}
        className="text-xs font-medium px-3 py-2 rounded-lg bg-mint-500 text-black hover:bg-mint-400 transition disabled:opacity-50 shrink-0"
      >
        {busy ? "..." : "ใช้เครื่องนี้"}
      </button>
    </div>
  );
}
