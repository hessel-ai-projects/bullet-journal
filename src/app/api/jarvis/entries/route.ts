import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { validateJarvisAuth, requireUserId } from '@/lib/jarvis-auth';

export async function GET(request: NextRequest) {
  const authError = validateJarvisAuth(request);
  if (authError) return authError;

  const result = requireUserId(request);
  if ('error' in result) return result.error;

  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const logType = url.searchParams.get('log_type');
  const collectionId = url.searchParams.get('collection_id');

  const supabase = createServiceClient();
  let query = supabase
    .from('entries')
    .select('*')
    .eq('user_id', result.userId)
    .order('position', { ascending: true });

  if (date) query = query.eq('date', date);
  if (logType) query = query.eq('log_type', logType);
  if (collectionId) query = query.eq('collection_id', collectionId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const authError = validateJarvisAuth(request);
  if (authError) return authError;

  const result = requireUserId(request);
  if ('error' in result) return result.error;

  const body = await request.json();
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('entries')
    .insert({
      ...body,
      user_id: result.userId,
      source: 'jarvis',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
