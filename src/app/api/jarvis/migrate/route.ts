import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { validateJarvisAuth, requireUserId } from '@/lib/jarvis-auth';

export async function POST(request: NextRequest) {
  const authError = validateJarvisAuth(request);
  if (authError) return authError;

  const result = requireUserId(request);
  if ('error' in result) return result.error;

  const body = await request.json();
  const { entry_id, date, log_type, status } = body;

  if (!entry_id) {
    return NextResponse.json({ error: 'entry_id is required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Mark original as migrated
  const { error: updateError } = await supabase
    .from('entries')
    .update({ status: 'migrated' })
    .eq('id', entry_id)
    .eq('user_id', result.userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Fetch original entry
  const { data: original, error: fetchError } = await supabase
    .from('entries')
    .select('*')
    .eq('id', entry_id)
    .single();

  if (fetchError || !original) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

  // Create migrated copy
  const { data: migrated, error: insertError } = await supabase
    .from('entries')
    .insert({
      user_id: result.userId,
      type: original.type,
      content: original.content,
      status: status ?? 'open',
      log_type: log_type ?? original.log_type,
      collection_id: original.collection_id,
      date: date ?? original.date,
      parent_id: original.parent_id,
      tags: original.tags,
      position: 0,
      source: 'jarvis',
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      original: { ...original, status: 'migrated' },
      migrated,
    },
  });
}
