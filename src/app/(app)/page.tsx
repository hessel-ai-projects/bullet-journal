import { createClient } from '@/lib/supabase/server';
import { DailyLog } from '@/components/daily-log';

export default async function DailyLogPage() {
  const supabase = createClient();
  const today = new Date().toISOString().split('T')[0];

  const { data: entries } = await supabase
    .from('entries')
    .select('*')
    .eq('log_type', 'daily')
    .eq('date', today)
    .order('position', { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Daily Log</h1>
        <p className="text-muted-foreground text-sm">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>
      <DailyLog initialEntries={entries ?? []} date={today} />
    </div>
  );
}
