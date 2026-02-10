import { NextResponse } from 'next/server';
import { getCurrentGame, setCurrentGame } from '@/lib/engine/GameState';

export async function POST(request: Request) {
  try {
    const game = getCurrentGame();
    if (!game) {
      return NextResponse.json({ success: false, error: 'No active game' }, { status: 404 });
    }

    const body = await request.json();
    const updatedGame = {
      ...game,
      globalWorldEvents: [...game.globalWorldEvents, `[СООБЩЕНИЕ ОТ СОЗДАТЕЛЯ МИРА]: ${body.message}`],
    };

    setCurrentGame(updatedGame);
    const responseGame = { ...updatedGame, apiKeys: {} };
    return NextResponse.json({ success: true, game: responseGame });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
