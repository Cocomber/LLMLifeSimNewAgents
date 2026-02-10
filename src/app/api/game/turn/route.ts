import { NextResponse } from 'next/server';
import { getCurrentGame, setCurrentGame } from '@/lib/engine/GameState';
import { generateTurn, generateMultipleTurns } from '@/lib/engine/TurnGenerator';
import { GameState } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const count = body.count || 1;

    // Try to get game from server memory first
    let game = getCurrentGame();

    // If server lost state, restore from client-sent backup
    if (!game && body.gameState) {
      game = body.gameState as GameState;
      setCurrentGame(game);
    }

    if (!game) {
      return NextResponse.json({ success: false, error: 'No active game. Please restart the simulation.' }, { status: 404 });
    }

    // Restore API keys from client if they were stripped
    if (body.apiKeys && Object.keys(body.apiKeys).some((k: string) => (body.apiKeys as any)[k])) {
      game = { ...game, apiKeys: body.apiKeys };
      setCurrentGame(game);
    }

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
