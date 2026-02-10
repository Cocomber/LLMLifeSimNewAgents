import { GameState, AgentConfig, ApiKeys, GameSettings, CommunicationMode } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { generateWorld } from './World';
import { initializeAgent } from './TurnGenerator';

let currentGame: GameState | null = null;

export function getCurrentGame(): GameState | null {
  return currentGame;
}

export function setCurrentGame(game: GameState | null): void {
  currentGame = game;
}

export function createNewGame(
  agentConfigs: AgentConfig[],
  apiKeys: ApiKeys,
  settings?: Partial<GameSettings>
): GameState {
  const world = generateWorld(20, 20);

  const defaultSettings: GameSettings = {
    communicationMode: (settings?.communicationMode || 'speech') as CommunicationMode,
    visibilityRange: settings?.visibilityRange || 2,
    needsDecayRate: settings?.needsDecayRate || {
      hunger: 3,
      thirst: 4,
      comfort: 1,
    },
  };

  const game: GameState = {
    id: uuidv4(),
    currentTurn: 0,
    world,
    agents: [], // will be filled after initialization
    turnHistory: [],
    settings: defaultSettings,
    apiKeys,
    agentConfigs,
    createdAt: new Date().toISOString(),
    globalWorldEvents: [],
  };

  currentGame = game;
  return game;
}

// Initialize agents (needs to be async because it calls LLM)
export async function initializeAgents(game: GameState): Promise<GameState> {
  const agents = [];
  for (const config of game.agentConfigs) {
    const agent = await initializeAgent(config, game);
    agents.push(agent);
    // Update game so next agent sees previous agents' positions
    game = { ...game, agents: [...agents] };
  }
  game = { ...game, agents };
  currentGame = game;
  return game;
}
