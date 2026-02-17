import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { validateJarvisAuth, requireUserId } from '@/lib/jarvis-auth';

export async function PATCH(
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
    .update(body)
    .eq('id', params.id)
    .eq('user_id', result.userId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = validateJarvisAuth(request);
  if (authError) return authError;

  const result = requireUserId(request);
  if ('error' in result) return result.error;

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('entries')
    .delete()
    .eq('id', params.id)
    .eq('user_id', result.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
