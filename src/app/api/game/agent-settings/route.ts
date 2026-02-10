import { NextResponse } from 'next/server';
import { getCurrentGame, setCurrentGame } from '@/lib/engine/GameState';
import type { GameState, LLMModel } from '@/types';

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

    const { agentId, action, model, paused } = body as {
      agentId: string;
      action: 'change_model' | 'toggle_pause' | 'reset_errors';
      model?: LLMModel;
      paused?: boolean;
    };

    const updatedAgents = game.agents.map((agent) => {
      if (agent.id !== agentId) return agent;

      switch (action) {
        case 'change_model':
          if (!model) return agent;
          return { ...agent, model, errorCount: 0, lastError: undefined };

        case 'toggle_pause':
          return { ...agent, paused: paused !== undefined ? paused : !agent.paused };

        case 'reset_errors':
          return { ...agent, errorCount: 0, lastError: undefined, lastErrorTurn: undefined };

        default:
          return agent;
      }
    });

    const updatedGame = { ...game, agents: updatedAgents };
    setCurrentGame(updatedGame);

    const responseGame = { ...updatedGame, apiKeys: {} };
    return NextResponse.json({ success: true, game: responseGame });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
