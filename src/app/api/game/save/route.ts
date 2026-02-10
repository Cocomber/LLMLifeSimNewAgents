import { NextResponse } from 'next/server';
import { getCurrentGame } from '@/lib/engine/GameState';
import { saveGame } from '@/lib/storage/SaveLoadManager';

export async function POST(request: Request) {
  try {
    const game = getCurrentGame();
    if (!game) {
      return NextResponse.json({ success: false, error: 'No active game' }, { status: 404 });
    }

    const body = await request.json();
    const filename = saveGame(game, body.name);
    return NextResponse.json({ success: true, filename });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
