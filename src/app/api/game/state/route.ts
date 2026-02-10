import { NextResponse } from 'next/server';
import { getCurrentGame } from '@/lib/engine/GameState';

export async function GET() {
  const game = getCurrentGame();
  if (!game) {
    return NextResponse.json({ success: false, error: 'No active game' }, { status: 404 });
  }
  const responseGame = { ...game, apiKeys: {} };
  return NextResponse.json({ success: true, game: responseGame });
}
