import { NextResponse } from 'next/server';
import { getCurrentGame, setCurrentGame } from '@/lib/engine/GameState';
import { GameState } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let game = getCurrentGame();
    if (!game && body.gameState) {
      game = body.gameState as GameState;
      if (body.apiKeys) game = { ...game, apiKeys: body.apiKeys };
      setCurrentGame(game);
    }
    if (!game) {
      return NextResponse.json({ success: false, error: 'No active game' }, { status: 404 });
    }
    if (body.apiKeys) {
      game = { ...game, apiKeys: body.apiKeys };
      setCurrentGame(game);
    }

    const { agentId, globalGoal } = body;

    const updatedAgents = game.agents.map(agent =>
      agent.id === agentId ? { ...agent, globalGoal } : agent
    );

    const updatedGame = { ...game, agents: updatedAgents };
    setCurrentGame(updatedGame);

    const responseGame = { ...updatedGame, apiKeys: {} };
    return NextResponse.json({ success: true, game: responseGame });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
