import { NextRequest, NextResponse } from 'next/server';

export function validateJarvisAuth(request: NextRequest): NextResponse | null {
  const apiKey = request.headers.get('x-api-key');

  if (!apiKey || apiKey !== process.env.JARVIS_API_KEY) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  return null;
}

export function getUserId(request: NextRequest): string | null {
  const url = new URL(request.url);
  return url.searchParams.get('user_id') ?? null;
}

export function requireUserId(request: NextRequest): { userId: string } | { error: NextResponse } {
  const userId = getUserId(request);
  if (!userId) {
    return {
      error: NextResponse.json(
        { error: 'user_id query parameter is required' },
        { status: 400 }
      ),
    };
  }
  return { userId };
}
