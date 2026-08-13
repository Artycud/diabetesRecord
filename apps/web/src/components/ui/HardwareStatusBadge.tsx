interface Props {
  /** true = sensor heartbeat is online, false = paired but not responding,
   *  undefined = not resolved yet (renders nothing — avoids a flash of
   *  "offline" on every page load before the first response lands). */
  online: boolean | undefined;
  readyLabel: string;
  offlineLabel: string;
}

/** Micro pill + dot, following the same hand-rolled dot+label convention
 *  already used for device link-status elsewhere in the app (e.g.
 *  me/device/page.tsx's statusLabel()) rather than the generic Badge
 *  component, which has no dot slot. Ready = mint + pulse (matches that
 *  same "live" treatment); offline = neutral gray, not red — this app's
 *  color system deliberately avoids alarmist framing (riskLabel.ts), and
 *  an idle-overnight sensor isn't an error state. */
export function HardwareStatusBadge({ online, readyLabel, offlineLabel }: Props) {
  if (online == null) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${
        online ? "bg-mint-500/10 text-mint-600" : "bg-bg-raised text-text-muted"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-mint-500 animate-pulse" : "bg-text-disabled"}`} />
      {online ? readyLabel : offlineLabel}
    </span>
  );
}
