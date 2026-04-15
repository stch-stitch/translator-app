import { NextResponse } from 'next/server';

export async function POST(req: Request): Promise<NextResponse> {
  const { password } = await req.json();
  const secret = process.env.APP_SECRET;

  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured: APP_SECRET not set' }, { status: 500 });
  }

  if (!password || password !== secret) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
