"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { parseServerTime } from "@/lib/time";
import { useAuth } from "@/lib/auth";
import { useDeviceStream } from "@/lib/useDeviceStream";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
  Bell, Settings, Shield, ChevronRight, Plus,
  RefreshCw,
} from "lucide-react";

type MenuItem =
  | { icon: React.ElementType; label: string; href: string | ((id: string) => string); danger?: boolean; disabled?: boolean }
  | { icon: React.ElementType; label: string; onClick: () => void; danger?: boolean; disabled?: boolean };

type LinkStatus = "waiting" | "live" | "idle" | "offline";

function statusLabel(s: LinkStatus): { label: string; color: string; dot: string } {
  switch (s) {
    case "live":    return { label: "Live · กำลังส่งข้อมูล", color: "text-mint-500",   dot: "bg-mint-500 animate-pulse" };
    case "idle":    return { label: "Idle · เพิ่งขาดหาย",    color: "text-amber-400",  dot: "bg-amber-400" };
    case "offline": return { label: "Offline · ไม่ได้เชื่อมต่อ", color: "text-text-muted", dot: "bg-text-disabled" };
    case "waiting": return { label: "รอสัญญาณแรกจากอุปกรณ์",  color: "text-text-muted", dot: "bg-text-disabled" };
  }
}

export default function DevicePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPending, setResetPending] = useState(false);

  useDeviceStream(user?.id);

  async function handleUnlink(id: string) {
    if (!confirm("ยกเลิกการเชื่อมต่ออุปกรณ์นี้? (สามารถเลือกใหม่จาก shared pool ได้)")) return;
    try {
      await api.sensor.unlinkDevice(id);
      toast.success("ยกเลิกการเชื่อมต่อแล้ว");
      qc.invalidateQueries({ queryKey: ["sensor", "devices"] });
      qc.invalidateQueries({ queryKey: ["sensor", "shared-devices"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ");
    }
  }

  const { data: devices } = useQuery({
    queryKey: ["sensor", "devices"],
    queryFn: api.sensor.listDevices,
  });

  const ownedDevice = devices?.[0];

  // Shared-device pool — allow a second user to see & claim the same physical ESP
  const { data: sharedDevices, refetch: refetchPool } = useQuery({
    queryKey: ["sensor", "shared-devices"],
    queryFn: api.sensor.listSharedDevices,
    refetchInterval: 15_000,
  });
  const myClaim = sharedDevices?.find((d) => d.claimed_by_me);
  const claimableDevices = sharedDevices?.filter((d) => !d.claimed_by_me) ?? [];

  // Effective primary: owned first, then a shared device the user has claimed
  const device = ownedDevice ?? (myClaim ? {
    id: myClaim.id,
    kind: myClaim.kind,
    active: myClaim.active,
    needs_recalibration: myClaim.needs_recalibration,
    last_calibrated_at: null,
    sensor_model: myClaim.sensor_model,
  } : undefined);

  async function handleClaim(id: string) {
    try {
      const res = await api.sensor.claimSharedDevice(id);
      if (res.displaced_username) {
        toast.success(`ใช้เครื่องได้แล้ว (${res.displaced_username} ถูกปล่อยอัตโนมัติ)`);
      } else {
        toast.success("ใช้เครื่องได้แล้ว");
      }
      refetchPool();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ขอใช้เครื่องไม่สำเร็จ");
    }
  }

  async function handleRelease(id: string) {
    try {
      await api.sensor.releaseSharedDevice(id);
      toast.success("ปล่อยเครื่องแล้ว");
      refetchPool();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ปล่อยเครื่องไม่สำเร็จ");
    }
  }

  // Real-time device presence via server heartbeat (refreshes every 60s TTL as
  // MQTT messages arrive). This works even when no recording session is active,
  // so the user can still see whether their ESP32 is powered / online.
  const { data: recStatus } = useQuery({
    queryKey: ["sensor", "recording-status", device?.id],
    queryFn:  () => api.sensor.recordingStatus(device!.id),
    enabled:  !!device,
    refetchInterval: 10_000,
  });

  const { data: recentReadings } = useQuery({
    queryKey: ["sensor", "readings", device?.id, "last"],
    queryFn: () => api.sensor.getReadings(device!.id, 30, 1),
    enabled: !!device,
    refetchInterval: 60_000,
  });

  const lastReading = recentReadings?.[recentReadings.length - 1];
  const linkStatus: LinkStatus = !device
    ? "waiting"
    : recStatus?.online
      ? "live"
      : lastReading?.time
        ? "offline"
        : "waiting";
  const status = statusLabel(linkStatus);
  const isLive = linkStatus === "live";
  const lastSeenText = lastReading?.time
    ? parseServerTime(lastReading.time).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
    : null;

  async function handleResetWifi() {
    if (!device) return;
    setResetPending(true);
    try {
      await api.sensor.resetWifi(device.id);
      toast.success("ส่งคำสั่งรีเซ็ตแล้ว — รอ ~5 วินาที อุปกรณ์จะรีสตาร์ท");
      setResetOpen(false);
    } catch {
      toast.error("ส่งคำสั่งไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setResetPending(false);
    }
  }

  const basicMenuItems: MenuItem[] = [
    { icon: Bell, label: "Notifications & alerts", href: "#", disabled: true },
  ];

  const advancedMenuItems: MenuItem[] = [
    { icon: Shield,    label: "Data privacy",      href: "#", disabled: true },
    { icon: Settings,  label: "Advanced settings", href: "#", disabled: true },
    { icon: RefreshCw, label: "Reset device WiFi", onClick: () => setResetOpen(true), danger: true },
  ];

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-24 space-y-5">
      {/* Compact status row — shows for any active device, with a quick release
          button for shared claims. Placed above the hero for quick access. */}
      {device && (
        <div className="bg-bg-elevated rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {device.sensor_model ?? "MetaBreath TGS1820"}
                {myClaim && !ownedDevice && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-mint-500/20 text-mint-500 font-medium align-middle">
                    shared
                  </span>
                )}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <div className={`h-2 w-2 rounded-full ${status.dot}`} />
                <p className={`text-xs ${status.color}`}>{isLive ? "Connected · Live" : "Disconnected"}</p>
              </div>
            </div>
            {!ownedDevice && myClaim && (
              <button
                onClick={() => handleRelease(myClaim.id)}
                className="text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded-lg bg-bg-raised"
              >
                ปล่อย
              </button>
            )}
          </div>
        </div>
      )}

      {/* Device hero card */}
      <div className="bg-bg-elevated rounded-3xl overflow-hidden">
        <div className="h-40 bg-gradient-to-br from-mint-500/10 to-blue-500/10 flex items-center justify-center">
          <div className="h-20 w-20 rounded-2xl bg-bg-raised flex items-center justify-center">
            <span className="text-4xl">🫁</span>
          </div>
        </div>

        <div className="p-4">
          {device ? (
            <>
              <p className="text-lg font-bold text-text-primary">
                {device.sensor_model ?? "MetaBreath TGS1820 v1"}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <div className={`h-2 w-2 rounded-full ${status.dot}`} />
                <p className={`text-sm ${status.color}`}>{status.label}</p>
              </div>
              {lastSeenText && !isLive && (
                <p className="text-[11px] text-text-muted mt-1">
                  ล่าสุด: {lastSeenText}
                </p>
              )}

              {device.needs_recalibration && (
                <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-2">
                  <span className="text-amber-400 text-sm">⚠️</span>
                  <p className="text-xs text-amber-400">ต้องการ calibrate</p>
                  <Link href={`/me/device/${device.id}/calibrate`} className="ml-auto text-xs text-amber-400 font-semibold underline">
                    Calibrate now
                  </Link>
                </div>
              )}

              {/* First-time WiFi setup instructions — only for OWNED devices that never came online.
                  For claimed shared devices we skip this: the primary owner already provisioned WiFi. */}
              {linkStatus === "waiting" && ownedDevice && (
                <div className="mt-3 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 space-y-3">
                  <p className="text-xs text-blue-300 font-bold">ตั้งค่าอุปกรณ์ MetaBreath</p>
                  <div className="space-y-1">
                    <p className="text-[11px] text-text-muted font-semibold">① เปิดไฟ MetaBreath → เชื่อม WiFi:</p>
                    <div className="bg-bg-raised rounded-lg px-3 py-2 font-mono text-sm text-blue-200 font-bold tracking-wide">
                      MetaBreath-Setup-XXXX
                    </div>
                    <p className="text-[10px] text-text-disabled">จากนั้นเปิด Safari/Chrome → พิมพ์ 192.168.4.1</p>
                  </div>
                  <p className="text-[10px] text-text-disabled leading-relaxed">
                    ② เลือก WiFi บ้าน → กรอกรหัส → กด Save — อุปกรณ์จะเชื่อมต่อและส่งข้อมูลอัตโนมัติ
                  </p>
                  <button
                    onClick={() => ownedDevice && handleUnlink(ownedDevice.id)}
                    className="w-full mt-1 text-[11px] text-text-muted underline hover:text-red-400 transition-colors"
                  >
                    ยกเลิกการเชื่อมต่อ (เลือกเครื่องอื่นจาก shared pool)
                  </button>
                </div>
              )}
              {linkStatus === "waiting" && !ownedDevice && (
                <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                  <p className="text-xs text-amber-400">รอสัญญาณจากอุปกรณ์... ให้เจ้าของเปิดเครื่องก่อน</p>
                </div>
              )}

              <button
                disabled={!isLive}
                className={`mt-3 w-full rounded-full py-2.5 text-sm font-semibold transition-colors ${
                  isLive
                    ? "bg-mint-500 text-white hover:bg-mint-400"
                    : "bg-bg-raised text-text-muted cursor-not-allowed"
                }`}
              >
                {isLive ? "● Live" : linkStatus === "waiting" ? "รอสัญญาณ..." : "Offline"}
              </button>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-text-muted">ยังไม่มีอุปกรณ์</p>
              <Link href="/me/device/add">
                <button className="mt-3 w-full bg-mint-500 text-white rounded-full py-2.5 text-sm font-semibold hover:bg-mint-400 transition-colors flex items-center justify-center gap-2">
                  <Plus size={16} />
                  Add your first device
                </button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Release action moved to the compact status row at the top of the page. */}

      {/* Shared device pool — visible when the user doesn't own any device */}
      {!ownedDevice && claimableDevices.length > 0 && (
        <div className="bg-bg-elevated rounded-2xl p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-text-primary">อุปกรณ์ที่ใช้ร่วมกัน</p>
            <p className="text-xs text-text-muted mt-0.5">
              กด <strong>ใช้เครื่อง</strong> เพื่อจอง — ค่าที่วัดจะบันทึกในบัญชีคุณ
            </p>
          </div>
          {claimableDevices.map((d) => (
            <div key={d.id} className="bg-bg-raised rounded-xl p-3 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-mint-500/20 flex items-center justify-center">
                <span className="text-lg">🫁</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">
                  {d.sensor_model ?? "MetaBreath TGS1820"}
                </p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {d.claimed_by_username
                    ? `ใช้อยู่โดย ${d.claimed_by_username}`
                    : d.last_seen_at
                      ? `ล่าสุด: ${parseServerTime(d.last_seen_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}`
                      : "พร้อมใช้"}
                </p>
              </div>
              <button
                onClick={() => handleClaim(d.id)}
                className="bg-mint-500 text-white rounded-full px-3.5 py-1.5 text-xs font-semibold hover:bg-mint-400 transition-colors"
              >
                ใช้เครื่อง
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Menu — Basic */}
      {device && (
        <div className="bg-bg-elevated rounded-2xl overflow-hidden">
          <p className="text-xs text-text-muted font-semibold uppercase tracking-widest px-4 pt-4 pb-2">Device</p>
          {basicMenuItems.map((item, idx) => {
            const isLast = idx === basicMenuItems.length - 1;
            const rowClass = `flex items-center gap-3 px-4 py-3.5 transition-colors ${!isLast ? "border-b border-border-soft" : ""} ${item.disabled ? "opacity-40 pointer-events-none" : "hover:bg-bg-raised"}`;
            const inner = (
              <>
                <div className="h-8 w-8 rounded-lg bg-bg-raised flex items-center justify-center">
                  <item.icon size={15} className="text-text-muted" strokeWidth={1.6} />
                </div>
                <span className="flex-1 text-sm text-text-primary">{item.label}</span>
                {item.disabled
                  ? <span className="text-[10px] text-text-disabled bg-bg-raised px-2 py-0.5 rounded-full">Soon</span>
                  : <ChevronRight size={14} className="text-text-disabled" />}
              </>
            );
            if ("onClick" in item) {
              return <button key={item.label} onClick={item.onClick} className={`w-full text-left ${rowClass}`}>{inner}</button>;
            }
            const resolvedHref = typeof item.href === "function" ? item.href(device.id) : item.href;
            return <Link key={item.label} href={resolvedHref} className={rowClass}>{inner}</Link>;
          })}
        </div>
      )}

      {/* Menu — Advanced */}
      {device && (
        <div className="bg-bg-elevated rounded-2xl overflow-hidden">
          <p className="text-xs text-text-muted font-semibold uppercase tracking-widest px-4 pt-4 pb-2">Advanced</p>
          {advancedMenuItems.map((item, idx) => {
            const isLast = idx === advancedMenuItems.length - 1;
            const rowClass = `flex items-center gap-3 px-4 py-3.5 transition-colors ${!isLast ? "border-b border-border-soft" : ""} ${item.disabled ? "opacity-40 pointer-events-none" : "hover:bg-bg-raised"}`;
            const inner = (
              <>
                <div className="h-8 w-8 rounded-lg bg-bg-raised flex items-center justify-center">
                  <item.icon size={15} className={item.danger ? "text-red-400" : "text-text-muted"} strokeWidth={1.6} />
                </div>
                <span className={`flex-1 text-sm ${item.danger ? "text-red-400" : "text-text-primary"}`}>{item.label}</span>
                {item.disabled
                  ? <span className="text-[10px] text-text-disabled bg-bg-raised px-2 py-0.5 rounded-full">Soon</span>
                  : <ChevronRight size={14} className="text-text-disabled" />}
              </>
            );
            if ("onClick" in item) {
              return <button key={item.label} onClick={item.onClick} className={`w-full text-left ${rowClass}`}>{inner}</button>;
            }
            const resolvedHref = typeof item.href === "function" ? item.href(device.id) : item.href;
            return <Link key={item.label} href={resolvedHref} className={rowClass}>{inner}</Link>;
          })}
        </div>
      )}

      {/* Add another device */}
      {device && (
        <Link href="/me/device/add" className="flex items-center gap-3 bg-bg-elevated rounded-2xl p-4 hover:bg-bg-raised transition-colors">
          <div className="h-8 w-8 rounded-lg bg-mint-500/20 flex items-center justify-center">
            <Plus size={16} className="text-mint-500" />
          </div>
          <span className="text-sm text-text-primary">Add another device</span>
          <ChevronRight size={14} className="text-text-disabled ml-auto" />
        </Link>
      )}

      {/* Reset WiFi confirmation modal */}
      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-bg-elevated rounded-2xl p-5 max-w-sm w-full space-y-4">
            <h2 className="text-lg font-bold text-text-primary">รีเซ็ต WiFi ของอุปกรณ์?</h2>
            <p className="text-sm text-text-muted leading-relaxed">
              อุปกรณ์จะลืมรหัส WiFi ที่บันทึกไว้ และรีสตาร์ทเข้าโหมด setup{" "}
              (<code className="text-blue-300">MetaBreath-Setup-XXXX</code>)
              <br /><br />
              คุณจะต้องตั้งค่า WiFi ใหม่ผ่านโทรศัพท์/คอมพิวเตอร์
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setResetOpen(false)}
                disabled={resetPending}
                className="flex-1 bg-bg-raised text-text-primary rounded-full py-2.5 text-sm font-medium"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleResetWifi}
                disabled={resetPending}
                className="flex-1 bg-red-500 text-white rounded-full py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {resetPending ? "กำลังส่ง..." : "รีเซ็ต"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
