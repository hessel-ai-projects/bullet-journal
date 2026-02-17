import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { validateJarvisAuth, requireUserId } from '@/lib/jarvis-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = validateJarvisAuth(request);
  if (authError) return authError;

  const result = requireUserId(request);
  if ('error' in result) return result.error;

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('collection_id', params.id)
    .eq('user_id', result.userId)
    .order('position', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      collection_id: params.id,
      log_type: 'collection',
      source: 'jarvis',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
