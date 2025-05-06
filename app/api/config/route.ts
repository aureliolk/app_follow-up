import { NextResponse } from 'next/server';

export async function GET() {
  console.log('[API /api/config] Request received for Pusher config');

  const pusherKey = process.env.PUSHER_KEY;
  const pusherCluster = process.env.PUSHER_CLUSTER;

  if (!pusherKey || !pusherCluster) {
    console.error('[API /api/config] Error: PUSHER_KEY or PUSHER_CLUSTER environment variables are not set on the server.');
    return NextResponse.json(
      { error: 'Server configuration missing for real-time connection.' },
      { status: 500 }
    );
  }

  console.log('[API /api/config] Returning Pusher public config.');
  return NextResponse.json({
    pusherKey: pusherKey,
    pusherCluster: pusherCluster,
  });
} 