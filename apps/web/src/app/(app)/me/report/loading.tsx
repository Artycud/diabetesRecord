// Same spinner treatment as /trends' own loading.tsx, scoped to this route.
export default function ReportLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-12 md:pt-6 pb-24 flex items-center justify-center" style={{ minHeight: "60vh" }}>
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-mint-500 border-t-transparent" />
    </div>
  );
}
