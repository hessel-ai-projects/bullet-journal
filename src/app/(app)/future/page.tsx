import { FutureLog } from '@/components/future-log';

export default function FutureLogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Future Log</h1>
        <p className="text-muted-foreground text-sm">Plan ahead — next 6 months</p>
      </div>
      <FutureLog />
    </div>
  );
}
