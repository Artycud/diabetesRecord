// Same spinner treatment as the top-level auth-loading state in
// (app)/layout.tsx, scoped to this route's own container so nothing jumps
// once the real content mounts.
export default function BreathingLoading() {
  return (
    <div className="w-full px-4 sm:px-6 md:max-w-2xl md:mx-auto lg:max-w-3xl pt-5 pb-24 flex items-center justify-center" style={{ minHeight: "60vh" }}>
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-mint-500 border-t-transparent" />
    </div>
  );
}
