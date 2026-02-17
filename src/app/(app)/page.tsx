import { createClient } from '@/lib/supabase/server';
import { DailyLog } from '@/components/daily-log';

export default async function DailyLogPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const supabase = createClient();
  const today = new Date().toISOString().split('T')[0];
  const date = searchParams.date || today;

  const { data: entries } = await supabase
    .from('entries')
    .select('*')
    .eq('log_type', 'daily')
    .eq('date', date)
    .order('position', { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Daily Log</h1>
      </div>
      <DailyLog initialEntries={entries ?? []} date={date} />
    </div>
  );
}
