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

function AddDeviceInner() {
  const router = useRouter();
  const [selectedModel, setSelectedModel] = useState("TGS1820");
  const [pairing, setPairing] = useState(false);

  async function createDevice() {
    setPairing(true);
    try {
      await api.sensor.pairDevice({ sensor_model: selectedModel });
      toast.success("สร้างอุปกรณ์สำเร็จ");
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
            <span>กด <strong className="text-text-primary">"สร้าง Device"</strong> — ระบบออก Device ID ให้ทันที</span>
          </li>
          <li className="flex gap-2">
            <span className="w-4 h-4 rounded-full bg-mint-500/20 text-mint-500 text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
            <span>เชื่อม WiFi <strong className="text-text-primary">MetaBreath-Setup-XXXX</strong> → เปิด 192.168.4.1</span>
          </li>
          <li className="flex gap-2">
            <span className="w-4 h-4 rounded-full bg-mint-500/20 text-mint-500 text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
            <span>วาง Device ID → เลือก WiFi บ้าน → กด Save → เสร็จ</span>
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

      <button
        onClick={createDevice}
        disabled={pairing}
        className="w-full bg-mint-500 text-white rounded-full py-3 text-sm font-semibold hover:bg-mint-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {pairing ? (
          <><Loader2 size={16} className="animate-spin" /> กำลังสร้าง...</>
        ) : (
          <><Cpu size={16} /> สร้าง Device</>
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
