"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Cpu, Loader2, Wifi } from "lucide-react";
import { api } from "@/lib/api";

const MODELS = [
  { value: "TGS1820", label: "MetaBreath TGS1820 v1", desc: "TGS1820 + XGZP6847A + SHT31" },
  { value: "custom",  label: "Custom firmware",       desc: "Sensor รุ่นอื่น / ทดสอบ" },
];

// Accepts a bare MAC ("88F155302810", "88:F1:55:30:28:10") or a pasted
// AP name ("MetaBreath-Setup-88F155302810") and normalizes to 12 hex chars.
function normalizeMac(input: string): string {
  const stripped = input.replace(/^MetaBreath-Setup-/i, "");
  return stripped.toUpperCase().replace(/[^0-9A-F]/g, "");
}

function AddDeviceInner() {
  const router = useRouter();
  const [selectedModel, setSelectedModel] = useState("TGS1820");
  const [macInput, setMacInput] = useState("");
  const [pairing, setPairing] = useState(false);

  const isStock = selectedModel === "TGS1820";
  const mac = normalizeMac(macInput);
  const macValid = mac.length === 12;

  async function createDevice() {
    if (isStock && !macValid) {
      toast.error("กรอก Device ID ให้ครบ 12 ตัว (ดูจากชื่อ WiFi MetaBreath-Setup-XXXXXXXXXXXX)");
      return;
    }
    setPairing(true);
    try {
      await api.sensor.pairDevice({
        sensor_model: selectedModel,
        ...(isStock ? { mac } : {}),
      });
      toast.success("เพิ่มอุปกรณ์สำเร็จ — เปิด 192.168.4.1 เพื่อตั้งค่า WiFi บ้านต่อ");
      router.replace("/me/device");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setPairing(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-24 space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="h-9 w-9 rounded-full bg-bg-elevated flex items-center justify-center"
        >
          <ArrowLeft size={18} className="text-text-muted" />
        </button>
        <h1 className="text-lg font-semibold text-text-primary">เพิ่มอุปกรณ์ MetaBreath</h1>
      </div>

      {/* Flow explanation */}
      <div className="bg-bg-elevated rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Wifi size={16} className="text-mint-500" strokeWidth={1.6} />
          <p className="text-sm font-semibold text-text-primary">3 ขั้นง่ายๆ — ไม่ต้องติดตั้ง software</p>
        </div>
        <ol className="space-y-2 text-xs text-text-muted leading-relaxed">
          <li className="flex gap-2">
            <span className="w-4 h-4 rounded-full bg-mint-500/20 text-mint-500 text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
            <span>เปิดไฟ MetaBreath → ในตั้งค่า WiFi ของมือถือ เชื่อมกับ <strong className="text-text-primary">MetaBreath-Setup-XXXXXXXXXXXX</strong></span>
          </li>
          <li className="flex gap-2">
            <span className="w-4 h-4 rounded-full bg-mint-500/20 text-mint-500 text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
            <span>คัดลอกรหัส 12 ตัวท้ายชื่อ WiFi นั้น มาใส่ในช่อง Device ID ด้านล่าง แล้วกด "เพิ่มอุปกรณ์"</span>
          </li>
          <li className="flex gap-2">
            <span className="w-4 h-4 rounded-full bg-mint-500/20 text-mint-500 text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
            <span>เปิด Safari/Chrome → พิมพ์ 192.168.4.1 → เลือก WiFi บ้าน → กด Save → เสร็จ</span>
          </li>
        </ol>
      </div>

      {/* Model picker */}
      <div className="bg-bg-elevated rounded-2xl p-4 space-y-3">
        <p className="text-sm font-semibold text-text-primary">เลือกรุ่นอุปกรณ์</p>
        <div className="space-y-2">
          {MODELS.map((m) => (
            <button
              key={m.value}
              onClick={() => setSelectedModel(m.value)}
              className={`w-full text-left p-3 rounded-xl border text-sm transition-colors ${
                selectedModel === m.value
                  ? "border-mint-500 bg-mint-500/10"
                  : "border-border-soft hover:border-border-strong"
              }`}
            >
              <p className={`font-medium ${selectedModel === m.value ? "text-text-primary" : "text-text-muted"}`}>{m.label}</p>
              <p className="text-xs text-text-muted mt-0.5">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Device ID (MAC) — required for the stock firmware, which always
          publishes under its own MAC and can't be told to use a different ID. */}
      {isStock && (
        <div className="bg-bg-elevated rounded-2xl p-4 space-y-2">
          <p className="text-sm font-semibold text-text-primary">Device ID</p>
          <p className="text-xs text-text-muted">
            ดูได้จากชื่อ WiFi <strong>MetaBreath-Setup-XXXXXXXXXXXX</strong> ตอนเชื่อมต่อ (หรือหน้าตั้งค่าที่ 192.168.4.1)
          </p>
          <input
            value={macInput}
            onChange={(e) => setMacInput(e.target.value)}
            placeholder="88F155302810"
            maxLength={30}
            className="w-full bg-bg-raised rounded-xl px-3 py-2.5 text-sm font-mono tracking-wide text-text-primary placeholder:text-text-disabled border border-border-soft focus:border-mint-500 outline-none"
          />
          {macInput.length > 0 && !macValid && (
            <p className="text-[11px] text-red-400">ต้องมี 12 ตัวอักษร (0-9, A-F) — ตอนนี้ได้ {mac.length} ตัว</p>
          )}
        </div>
      )}

      <button
        onClick={createDevice}
        disabled={pairing || (isStock && !macValid)}
        className="w-full bg-mint-500 text-white rounded-full py-3 text-sm font-semibold hover:bg-mint-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {pairing ? (
          <><Loader2 size={16} className="animate-spin" /> กำลังเพิ่ม...</>
        ) : (
          <><Cpu size={16} /> เพิ่มอุปกรณ์</>
        )}
      </button>
    </div>
  );
}

export default function AddDevicePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto px-4 pt-5 pb-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-mint-500 border-t-transparent mx-auto" />
        </div>
      }
    >
      <AddDeviceInner />
    </Suspense>
  );
}
