import { NextResponse } from 'next/server';
import { createNewGame, initializeAgents } from '@/lib/engine/GameState';
import { AgentConfig, ApiKeys, GameSettings } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agentConfigs, apiKeys, settings } = body as {
      agentConfigs: AgentConfig[];
      apiKeys: ApiKeys;
      settings?: Partial<GameSettings>;
    };

    let game = createNewGame(agentConfigs, apiKeys, settings);
    game = await initializeAgents(game);

    // Strip API keys from response
    const responseGame = { ...game, apiKeys: {} };
    return NextResponse.json({ success: true, game: responseGame });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
