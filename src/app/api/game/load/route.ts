import { NextResponse } from 'next/server';
import { setCurrentGame } from '@/lib/engine/GameState';
import { loadGame, listSaves } from '@/lib/storage/SaveLoadManager';
import { ApiKeys } from '@/types';

export async function GET() {
  try {
    const saves = listSaves();
    return NextResponse.json({ success: true, saves });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { filename, apiKeys } = body as { filename: string; apiKeys: ApiKeys };

    const game = loadGame(filename);
    game.apiKeys = apiKeys;
    setCurrentGame(game);

    const responseGame = { ...game, apiKeys: {} };
    return NextResponse.json({ success: true, game: responseGame });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
