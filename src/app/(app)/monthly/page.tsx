export default function MonthlyLogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Monthly Log</h1>
        <p className="text-muted-foreground text-sm">
          {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </p>
      </div>
      <p className="text-muted-foreground text-sm py-8 text-center">
        Monthly log view coming in Phase 2.
      </p>
    </div>
  );
}
