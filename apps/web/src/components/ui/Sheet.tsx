"use client";

import { Drawer } from "vaul";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}

/**
 * Shared bottom-sheet primitive built on `vaul` (installed, previously
 * unused) — real swipe-to-dismiss instead of the hand-rolled fixed/portal
 * sheets used elsewhere (DeviceStatusSheet, AcetoneZoneCard's
 * ZoneDetailModal). Every className below matches those existing sheets
 * exactly, so this is new infrastructure, not a new visual style.
 *
 * Note: vaul is bottom-anchored at all breakpoints — the existing hand
 * sheets are bottom-on-mobile/centered-on-desktop, which doesn't have a
 * sensible swipe-to-dismiss equivalent. Accepted as a deliberate,
 * scoped simplification for this new Sheet only; the existing sheets are
 * not being migrated in this pass.
 */
export function Sheet({ open, onOpenChange, title, children }: Props) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 mx-auto w-full max-w-md bg-bg-surface rounded-t-3xl pb-8 px-5 pt-5 max-h-[85vh] flex flex-col outline-none">
          <div className="w-10 h-1 bg-border-subtle rounded-full mx-auto mb-4 shrink-0" />
          <div className="flex items-start justify-between mb-3 shrink-0 gap-3">
            <Drawer.Title className="text-base font-semibold text-text-primary leading-snug">
              {title}
            </Drawer.Title>
            <Drawer.Close
              className="p-1.5 -mr-1.5 rounded-xl text-text-muted hover:text-text-primary transition-colors shrink-0"
              aria-label="ปิด"
            >
              <X size={18} />
            </Drawer.Close>
          </div>
          <div className="overflow-y-auto flex-1 min-h-0">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
