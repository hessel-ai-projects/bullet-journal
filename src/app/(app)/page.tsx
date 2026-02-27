import { fetchEntriesForDate } from '@/lib/entries';
import { DailyLog } from '@/components/daily-log';

export default async function DailyLogPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const today = new Date().toISOString().split('T')[0];
  const date = searchParams.date || today;

  const entries = await fetchEntriesForDate(date);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Daily Log</h1>
      </div>
      <DailyLog initialEntries={entries} date={date} />
    </div>
  );
}
