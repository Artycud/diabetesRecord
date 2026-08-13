"use client";

import { useEffect, useState } from "react";
import { api, type AiFallbackProviderOut } from "@/lib/api";

const DISPLAY: Record<string, { label: string; hint: string }> = {
  openai: { label: "OpenAI", hint: "gpt-4o-mini" },
  gemini: { label: "Google Gemini", hint: "gemini-1.5-flash" },
};

function ProviderRow({
  provider,
  onSaved,
}: {
  provider: AiFallbackProviderOut;
  onSaved: (updated: AiFallbackProviderOut) => void;
}) {
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const meta = DISPLAY[provider.key] ?? { label: provider.display_name, hint: provider.model };

  async function handleToggleEnabled() {
    setSaving(true);
    setError("");
    try {
      const updated = await api.admin.updateAiFallbackProvider(
        provider.key as "openai" | "gemini",
        { enabled: !provider.enabled }
      );
      onSaved(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveKey() {
    if (!key.trim()) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api.admin.updateAiFallbackProvider(
        provider.key as "openai" | "gemini",
        { api_key: key.trim() }
      );
      onSaved(updated);
      setKey("");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  async function handleClearKey() {
    setSaving(true);
    setError("");
    try {
      const updated = await api.admin.updateAiFallbackProvider(
        provider.key as "openai" | "gemini",
        { api_key: "" }
      );
      onSaved(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 text-sm">{meta.label}</span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                provider.configured
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {provider.configured ? "ตั้งค่าแล้ว" : "ยังไม่ได้ตั้งค่า"}
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {meta.hint} · priority {provider.priority}
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggleEnabled}
          disabled={saving}
          className={`relative w-10 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
            provider.enabled ? "bg-emerald-500" : "bg-gray-200"
          }`}
          aria-label={provider.enabled ? "ปิดการใช้งาน" : "เปิดการใช้งาน"}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              provider.enabled ? "translate-x-4" : ""
            }`}
          />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type={showKey ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={provider.configured ? "•••••••••••••• (แทนที่คีย์เดิม)" : "วาง API key"}
            autoComplete="off"
            spellCheck={false}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-9 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-[10px] font-medium"
          >
            {showKey ? "ซ่อน" : "แสดง"}
          </button>
        </div>
        <button
          type="button"
          onClick={handleSaveKey}
          disabled={saving || !key.trim()}
          className="text-xs font-medium px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 transition shrink-0"
        >
          {savedFlash ? "บันทึกแล้ว ✓" : "บันทึก"}
        </button>
        {provider.configured && (
          <button
            type="button"
            onClick={handleClearKey}
            disabled={saving}
            className="text-xs text-red-500 hover:text-red-700 px-2 py-2 disabled:opacity-40 transition shrink-0"
          >
            ล้างคีย์
          </button>
        )}
      </div>

      {error && <div className="text-xs text-red-500">{error}</div>}
    </div>
  );
}

/**
 * Global AI fallback keys — admin-configured OpenAI/Gemini API keys, stored
 * encrypted server-side (app.core.secrets), used by app.services.ai_fallback
 * as a second tier when the primary Claude call (/ai/interpret, /ai/chat,
 * /ai/chat/stream) fails or isn't configured. Never round-trips the actual
 * key back to the client after saving — only whether one is stored.
 */
export default function AdminAiFallbackPanel() {
  const [providers, setProviders] = useState<AiFallbackProviderOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.admin
      .getAiFallbackConfig()
      .then((res) => setProviders(res.providers))
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  function handleSaved(updated: AiFallbackProviderOut) {
    setProviders((prev) => prev.map((p) => (p.key === updated.key ? updated : p)));
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-gray-900 text-sm">AI Fallback Keys</h2>
        <span className="text-[11px] text-gray-400">Global · server-side only</span>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        ใช้เมื่อ Claude (ระบบหลัก) ล่มหรือโควต้าหมด — ผู้ใช้ทุกคนใช้คีย์เดียวกันนี้โดยอัตโนมัติ
        ไม่มี popup ให้ผู้ใช้กรอกคีย์เอง คีย์ถูกเข้ารหัสเก็บในฐานข้อมูล ไม่เคยส่งกลับไปที่ browser
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 bg-gray-50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <ProviderRow key={p.key} provider={p} onSaved={handleSaved} />
          ))}
        </div>
      )}
    </div>
  );
}
