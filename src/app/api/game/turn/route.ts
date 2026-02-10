import { NextResponse } from 'next/server';
import { getCurrentGame, setCurrentGame } from '@/lib/engine/GameState';
import { generateTurn, generateMultipleTurns } from '@/lib/engine/TurnGenerator';

export async function POST(request: Request) {
  try {
    const game = getCurrentGame();
    if (!game) {
      return NextResponse.json({ success: false, error: 'No active game' }, { status: 404 });
    }

    const body = await request.json();
    const count = body.count || 1;

    let updatedGame;
    if (count === 1) {
      updatedGame = await generateTurn(game);
    } else {
      updatedGame = await generateMultipleTurns(game, count);
    }

    setCurrentGame(updatedGame);
    const responseGame = { ...updatedGame, apiKeys: {} };
    return NextResponse.json({ success: true, game: responseGame });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
