"use client";

import { useRef, useState, useCallback } from "react";

// Height of each item row in px — also the drag distance per value step
const ITEM_H = 44;

interface DrumPickerProps {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  label: string;
  unit: string;
  bgImage: string;
  format?: (v: number) => string;
  className?: string;
}

export function DrumPicker({ values, value, onChange, label, unit, bgImage, format, className }: DrumPickerProps) {
  const [idx, setIdx] = useState(() => {
    const i = values.indexOf(value);
    return i >= 0 ? i : 0;
  });

  // Drag state stored in ref to avoid re-renders during move
  const drag = useRef<{ startY: number; startIdx: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Capture so move events fire even if pointer leaves element
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startIdx: idx };
  }, [idx]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    // Drag UP → higher index (higher value); drag DOWN → lower index
    const delta = Math.round((drag.current.startY - e.clientY) / ITEM_H);
    const newIdx = Math.max(0, Math.min(values.length - 1, drag.current.startIdx + delta));
    if (newIdx !== idx) {
      setIdx(newIdx);
      onChange(values[newIdx]);
    }
  }, [idx, values, onChange]);

  const handlePointerUp = useCallback(() => { drag.current = null; }, []);

  // Container shows 3 rows: above-center, center, below-center
  const containerH = ITEM_H * 3;

  return (
    // Labels sit OUTSIDE the drum container → zero overlap with adjacent items
    <div className={`flex flex-col items-center gap-1 ${className ?? ""}`}>
      <span className="text-white/65 text-[11px] font-semibold tracking-wider uppercase select-none">
        {label}
      </span>

      <div
        className="relative overflow-hidden rounded-xl w-full"
        style={{
          height: containerH,
          // touchAction:none → this div does NOT capture page scroll gestures
          touchAction: "none",
          cursor: "ns-resize",
        } as React.CSSProperties}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Background photo */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${bgImage}')` }}
        />
        {/* Dark scrim — lighter so photo is visible */}
        <div className="absolute inset-0 bg-black/38" />
        {/* Edge fade */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.5) 100%)",
          }}
        />
        {/* Center selection band */}
        <div
          className="absolute inset-x-8 pointer-events-none"
          style={{
            top: ITEM_H,
            height: ITEM_H,
            borderTop: "1px solid rgba(255,255,255,0.4)",
            borderBottom: "1px solid rgba(255,255,255,0.4)",
          }}
        />

        {/* Only render 3 items around center — absolutely positioned, no scroll div */}
        {([-1, 0, 1] as const).map((offset) => {
          const i = idx + offset;
          if (i < 0 || i >= values.length) return null;
          const isCenter = offset === 0;
          return (
            <div
              key={i}
              className="absolute inset-x-0 flex items-center justify-center pointer-events-none"
              style={{ top: (offset + 1) * ITEM_H, height: ITEM_H }}
            >
              <span
                style={{
                  color: "white",
                  fontSize: isCenter ? "1.75rem" : "1.0rem",
                  fontWeight: isCenter ? 700 : 400,
                  opacity: isCenter ? 1 : 0.38,
                  lineHeight: 1,
                  userSelect: "none",
                }}
              >
                {format ? format(values[i]) : values[i]}
              </span>
            </div>
          );
        })}
      </div>

      <span className="text-white/40 text-[10px] tracking-[0.15em] uppercase select-none">
        {unit}
      </span>
    </div>
  );
}
