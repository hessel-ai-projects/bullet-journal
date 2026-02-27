import { NextRequest, NextResponse } from 'next/server';
import { db, meetingNotes } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { validateJarvisAuth, requireUserId } from '@/lib/jarvis-auth';

export async function GET(request: NextRequest) {
  const authError = validateJarvisAuth(request);
  if (authError) return authError;

  const result = requireUserId(request);
  if ('error' in result) return result.error;

  const url = new URL(request.url);
  const collectionId = url.searchParams.get('collection_id');

  try {
    const data = await db.query.meetingNotes.findMany({
      where: and(
        eq(meetingNotes.userId, result.userId),
        collectionId ? eq(meetingNotes.collectionId, collectionId) : undefined
      ),
      orderBy: desc(meetingNotes.date),
    });

    return NextResponse.json({ data: data.map(mapMeetingNoteFromDb) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authError = validateJarvisAuth(request);
  if (authError) return authError;

  const result = requireUserId(request);
  if ('error' in result) return result.error;

  try {
    const body = await request.json();

    const [data] = await db.insert(meetingNotes).values({
      userId: result.userId,
      collectionId: body.collection_id,
      date: body.date,
      title: body.title,
      attendees: body.attendees ?? [],
      agenda: body.agenda,
      notes: body.notes,
    }).returning();

    if (!data) {
      return NextResponse.json({ error: 'Failed to create meeting note' }, { status: 500 });
    }

    return NextResponse.json({ data: mapMeetingNoteFromDb(data) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function mapMeetingNoteFromDb(dbNote: typeof meetingNotes.$inferSelect) {
  return {
    id: dbNote.id,
    collection_id: dbNote.collectionId,
    user_id: dbNote.userId,
    date: dbNote.date,
    title: dbNote.title,
    attendees: dbNote.attendees ?? [],
    agenda: dbNote.agenda,
    notes: dbNote.notes,
    created_at: dbNote.createdAt.toISOString(),
    updated_at: dbNote.updatedAt.toISOString(),
  };
}
