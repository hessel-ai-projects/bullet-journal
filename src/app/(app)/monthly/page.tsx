import { MonthlyLog } from '@/components/monthly-log';

export default function MonthlyLogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Monthly Log</h1>
      </div>
      <MonthlyLog />
    </div>
  );
}
