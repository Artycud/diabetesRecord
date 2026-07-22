// Mounted once (see app/providers.tsx). Defines the SVG displacement filter
// that `.liquid-glass-refract` (globals.css) references — CSS `filter: url()`
// requires the <filter> element to exist somewhere in the DOM, it can't be
// defined in CSS alone. Reserved for one or two hero surfaces only (see
// AcetoneRing/DailyCheckBanner) — backdrop-filter + SVG filter combinations
// are GPU-expensive and have had inconsistent Safari behavior historically,
// so this is a progressive enhancement, not something applied everywhere.
export function LiquidGlassFilterDef() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <filter id="liquid-glass-distortion">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.008" numOctaves={2} seed={4} result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="18" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
