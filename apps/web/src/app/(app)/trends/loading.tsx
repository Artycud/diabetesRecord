// Same spinner treatment as the top-level auth-loading state in
// (app)/layout.tsx, scoped to this route's own container so nothing jumps
// once the real content mounts.
export default function TrendsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-12 md:pt-6 pb-6 flex items-center justify-center" style={{ minHeight: "60vh" }}>
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-mint-500 border-t-transparent" />
    </div>
  );
}
