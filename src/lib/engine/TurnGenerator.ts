import type {
  GameState,
  AgentState,
  TurnRecord,
  ChatMessage,
  LLMAgentResponse,
  TurnLog,
  AgentConfig,
  AgentAction,
  Position,
} from '@/types';
import { getVisibleArea } from './World';
import { processFullResponse } from './ActionProcessor';
import { callLLM } from '../llm/providers';
import { buildSystemPrompt, buildUserPrompt, buildInitPrompt } from '../llm/PromptBuilder';
import {
  addTurnToMemory,
  shouldGenerateSummary,
  generateMemorySummaryPrompt,
  addSummary,
  createEmptyMemory,
} from '../memory/MemoryManager';
import { createMessage, getMessagesForAgent } from '../communication/CommunicationModule';

// ==================== Helpers ====================

/**
 * Find a random position on the grid that is not occupied by any existing
 * agent or world object. Falls back to a random position after a limited
 * number of attempts.
 */
function findUnoccupiedPosition(gameState: GameState): Position {
  const { world, agents } = gameState;
  const occupiedSet = new Set<string>();

  for (const agent of agents) {
    occupiedSet.add(`${agent.position.x},${agent.position.y}`);
  }
  for (const obj of world.objects) {
    occupiedSet.add(`${obj.position.x},${obj.position.y}`);
  }

  const maxAttempts = 200;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = Math.floor(Math.random() * world.width);
    const y = Math.floor(Math.random() * world.height);
    if (!occupiedSet.has(`${x},${y}`)) {
      return { x, y };
    }
  }

  // Fallback: return a random position even if occupied
  return {
    x: Math.floor(Math.random() * world.width),
    y: Math.floor(Math.random() * world.height),
  };
}

/**
 * Collect chat messages from the most recent turns in the turn history.
 * Used to provide conversational context to agents.
 */
function getRecentHistoryMessages(gameState: GameState, lookback: number = 5): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const startIdx = Math.max(0, gameState.turnHistory.length - lookback);
  for (let i = startIdx; i < gameState.turnHistory.length; i++) {
    messages.push(...gameState.turnHistory[i].messages);
  }
  return messages;
}

// ==================== Agent Initialization ====================

/**
 * Initialize a new agent by calling the LLM to generate a name and backstory,
 * then placing the agent at a random unoccupied position on the map.
 */
export async function initializeAgent(
  agentConfig: AgentConfig,
  gameState: GameState,
): Promise<AgentState> {
  const initPrompt = buildInitPrompt();
  const systemPrompt = 'You are a creative character creator. Respond only in valid JSON.';

  const response = await callLLM(
    agentConfig.model,
    systemPrompt,
    initPrompt,
    gameState.apiKeys,
  );

  // The init prompt asks for {name, backstory} — extract from the raw parsed response
  const rawResponse = response as any;
  const name: string = rawResponse.name || `Agent-${agentConfig.id.slice(0, 4)}`;
  const backstory: string = rawResponse.backstory || 'A mysterious wanderer with no memories.';

  const position = findUnoccupiedPosition(gameState);

  return {
    id: agentConfig.id,
    name,
    backstory,
    emoji: agentConfig.emoji,
    color: agentConfig.color,
    position,
    needs: {
      hunger: 0,
      thirst: 0,
      comfort: 100,
    },
    inventory: [],
    globalGoal: agentConfig.globalGoal,
    localGoal: 'Explore the world',
    model: agentConfig.model,
    memory: createEmptyMemory(),
    alive: true,
  };
}

// ==================== Single Turn Generation ====================

/**
 * Generate a single turn for all alive agents. Agents are processed
 * sequentially so that each agent observes world changes made by agents
 * that acted earlier in the same turn.
 *
 * Returns a new GameState with:
 *   - Incremented currentTurn
 *   - Updated agents (needs, positions, inventories, memories)
 *   - Updated world (placed/removed objects)
 *   - A new TurnRecord appended to turnHistory
 *   - Cleared globalWorldEvents
 */
export async function generateTurn(gameState: GameState): Promise<GameState> {
  const nextTurnId = gameState.currentTurn + 1;

  let currentWorld = { ...gameState.world };
  const updatedAgents: AgentState[] = [...gameState.agents];
  const allTurnMessages: ChatMessage[] = [];
  const agentTurns: TurnRecord['agentTurns'] = {};

  // Gather messages from recent turn history for conversational context
  const historyMessages = getRecentHistoryMessages(gameState);

  // All agent names for system prompt
  const allAgentNames = gameState.agents
    .filter((a) => a.alive)
    .map((a) => a.name);

  // Process each agent sequentially
  for (let i = 0; i < updatedAgents.length; i++) {
    const agent = updatedAgents[i];

    // Skip dead agents
    if (!agent.alive) {
      continue;
    }

    // (a) Get visible area for this agent
    const visibleArea = getVisibleArea(
      currentWorld,
      updatedAgents,
      agent.id,
      gameState.settings.visibilityRange,
    );

    // (b) Get recent messages visible to this agent (history + current turn)
    const availableMessages = [...historyMessages, ...allTurnMessages];
    const recentMessages = getMessagesForAgent(
      availableMessages,
      agent.id,
      agent.position,
      gameState.settings.visibilityRange,
      gameState.settings.communicationMode,
    );

    // (c) Build prompts
    const systemPrompt = buildSystemPrompt(agent, gameState.settings, allAgentNames);
    const userPrompt = buildUserPrompt(agent, gameState, visibleArea, recentMessages);

    // (d) Call the LLM
    const llmResponse: LLMAgentResponse = await callLLM(
      agent.model,
      systemPrompt,
      userPrompt,
      gameState.apiKeys,
    );

    // (e) Process the full response: actions, needs decay, messages
    const { needsDecayRate } = gameState.settings;
    const {
      updatedAgent,
      updatedWorld,
      messages: agentMessages,
    } = processFullResponse(
      agent,
      llmResponse,
      currentWorld,
      updatedAgents,
      nextTurnId,
      needsDecayRate.hunger,
      needsDecayRate.thirst,
      needsDecayRate.comfort,
    );

    // Apply world changes so subsequent agents see them
    currentWorld = updatedWorld;

    // Collect messages from this agent
    allTurnMessages.push(...agentMessages);

    // (f) Build TurnLog and add to agent's memory
    const primaryAction: AgentAction = (llmResponse.actions && llmResponse.actions.length > 0)
      ? (llmResponse.actions[0] as AgentAction)
      : { type: 'idle', target: null };

    const turnLog: TurnLog = {
      turnId: nextTurnId,
      agentId: agent.id,
      thought: llmResponse.thought,
      action: primaryAction,
      narrativeEvent: llmResponse.narrative_event,
      needs: { ...updatedAgent.needs },
      position: { ...updatedAgent.position },
      localGoal: llmResponse.local_goal,
      globalGoal: llmResponse.goal,
    };

    let updatedMemory = addTurnToMemory(
      updatedAgent.memory,
      turnLog,
      llmResponse.narrative_event,
    );

    // (g) Generate memory summary if it is time
    if (shouldGenerateSummary(updatedMemory, nextTurnId)) {
      const summaryPrompt = generateMemorySummaryPrompt(updatedMemory);
      const summaryResponse = await callLLM(
        agent.model,
        'You are a memory summarization system. Provide a concise summary paragraph.',
        summaryPrompt,
        gameState.apiKeys,
      );

      // Extract summary text from the response — use thought (fallback parser)
      // or narrative_event, whichever contains the actual summary content
      const summaryText =
        (summaryResponse as any).summary ||
        summaryResponse.thought ||
        summaryResponse.narrative_event ||
        'No summary available.';

      updatedMemory = addSummary(updatedMemory, summaryText);
    }

    // Store updated agent with new memory
    const finalAgent: AgentState = {
      ...updatedAgent,
      memory: updatedMemory,
    };
    updatedAgents[i] = finalAgent;

    // (h) Record this agent's turn data for the TurnRecord
    const actionsForRecord: AgentAction[] = (llmResponse.actions || []).slice(0, 3) as AgentAction[];
    agentTurns[agent.id] = {
      needs: { ...finalAgent.needs },
      position: { ...finalAgent.position },
      inventory: [...finalAgent.inventory],
      thought: llmResponse.thought,
      actions: actionsForRecord,
      narrativeEvent: llmResponse.narrative_event,
      globalGoal: finalAgent.globalGoal,
      localGoal: finalAgent.localGoal,
    };
  }

  // Build the TurnRecord for this turn
  const turnRecord: TurnRecord = {
    turnId: nextTurnId,
    timestamp: new Date().toISOString(),
    agentTurns,
    worldSnapshot: [...currentWorld.objects],
    messages: [...allTurnMessages],
    worldEvents: [...(gameState.globalWorldEvents || [])],
  };

  // Return the updated GameState
  return {
    ...gameState,
    currentTurn: nextTurnId,
    agents: updatedAgents,
    world: currentWorld,
    turnHistory: [...gameState.turnHistory, turnRecord],
    globalWorldEvents: [], // Clear world events after they have been applied
  };
}

// ==================== Multiple Turn Generation ====================

/**
 * Generate multiple turns sequentially. After each turn completes, the
 * optional `onTurnComplete` callback is invoked with the turn number and
 * the latest GameState, allowing the caller to update UI or persist state.
 *
 * Returns the final GameState after all turns have been processed.
 */
export async function generateMultipleTurns(
  gameState: GameState,
  count: number,
  onTurnComplete?: (turn: number, state: GameState) => void,
): Promise<GameState> {
  let currentState = gameState;

  for (let i = 0; i < count; i++) {
    currentState = await generateTurn(currentState);

    if (onTurnComplete) {
      onTurnComplete(currentState.currentTurn, currentState);
    }
  }

  return currentState;
}
