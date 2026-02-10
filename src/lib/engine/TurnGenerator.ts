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
  let name: string;
  let backstory: string;

  // If the user provided a custom name, skip LLM generation
  if (agentConfig.customName && agentConfig.customName.trim()) {
    name = agentConfig.customName.trim();
    const agePart = agentConfig.customAge ? `, ${agentConfig.customAge} лет` : '';
    backstory = agentConfig.customBackstory?.trim()
      || `${name}${agePart}. Таинственный обитатель этого мира.`;
    if (agentConfig.customAge && !agentConfig.customBackstory) {
      backstory = `${name}${agePart}. Таинственный обитатель этого мира, ищущий своё предназначение.`;
    }
  } else {
    // Generate name + backstory via LLM
    const initPrompt = buildInitPrompt();
    const systemPrompt = 'Ты — креативный создатель персонажей. Отвечай ТОЛЬКО на русском языке, строго в формате JSON.';

    const response = await callLLM(
      agentConfig.model,
      systemPrompt,
      initPrompt,
      gameState.apiKeys,
    );

    const rawResponse = response as any;
    name = rawResponse.name || `Странник-${agentConfig.id.slice(0, 4)}`;
    backstory = rawResponse.backstory || 'Таинственный странник, потерявший память.';
  }

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
    localGoal: 'Исследовать мир',
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

    // (a) Get visible area for this agent (pass relationships to hide unknown names)
    const visibleArea = getVisibleArea(
      currentWorld,
      updatedAgents,
      agent.id,
      gameState.settings.visibilityRange,
      agent.memory.relationships,
    );

    // (b) Get recent messages visible to this agent (history + current turn)
    const availableMessages = [...historyMessages, ...allTurnMessages];
    const recentMessages = getMessagesForAgent(
      availableMessages,
      agent.id,
      agent.position,
      gameState.settings.visibilityRange,
      gameState.settings.communicationMode,
      agent.name, // Pass agent name so direct messages by name are matched
    );

    // (c) Build prompts
    const systemPrompt = buildSystemPrompt(agent, gameState.settings, allAgentNames, nextTurnId);
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

    // (f2) Process relationships_update from LLM response
    if (llmResponse.relationships_update && typeof llmResponse.relationships_update === 'object') {
      const currentRels = { ...(updatedMemory.relationships || {}) };
      for (const [name, update] of Object.entries(llmResponse.relationships_update)) {
        if (update && typeof update === 'object') {
          const existing = currentRels[name];
          currentRels[name] = {
            name,
            description: String((update as any).description || ''),
            attitude: String((update as any).attitude || 'нейтральный'),
            lastSeenTurn: nextTurnId,
            conversationLog: existing?.conversationLog || [],
          };
        }
      }
      updatedMemory = { ...updatedMemory, relationships: currentRels };
    }

    // (f3) Store conversation messages in relationship logs (both sent and received)
    {
      const currentRels = { ...(updatedMemory.relationships || {}) };

      // Messages THIS agent sent this turn
      for (const msg of agentMessages) {
        // Find recipient name
        let recipientName = msg.toAgentId || undefined;
        if (recipientName) {
          // toAgentId might be a name or an id; try to resolve
          const recipientAgent = updatedAgents.find(
            (a) => a.id === recipientName || a.name === recipientName
          );
          if (recipientAgent) recipientName = recipientAgent.name;

          if (!currentRels[recipientName]) {
            currentRels[recipientName] = {
              name: recipientName,
              description: 'Кто-то, с кем я разговаривал',
              attitude: 'нейтральный',
              lastSeenTurn: nextTurnId,
              conversationLog: [],
            };
          }
          currentRels[recipientName] = {
            ...currentRels[recipientName],
            conversationLog: [
              ...currentRels[recipientName].conversationLog,
              { turnId: nextTurnId, speaker: agent.name, message: msg.message },
            ],
          };
        }
      }

      // Messages received by this agent this turn
      for (const msg of recentMessages) {
        // Only store messages from this turn
        if (msg.turnId !== 0) { // turnId 0 means not yet set; current turn messages have turnId set by ActionProcessor
          const senderName = msg.fromAgentName;
          if (!currentRels[senderName]) {
            currentRels[senderName] = {
              name: senderName,
              description: 'Кто-то, кто со мной разговаривал',
              attitude: 'нейтральный',
              lastSeenTurn: nextTurnId,
              conversationLog: [],
            };
          }
          // Avoid duplicate entries (msg might already be logged)
          const lastEntry = currentRels[senderName].conversationLog.slice(-1)[0];
          if (!lastEntry || lastEntry.turnId !== msg.turnId || lastEntry.message !== msg.message || lastEntry.speaker !== senderName) {
            currentRels[senderName] = {
              ...currentRels[senderName],
              conversationLog: [
                ...currentRels[senderName].conversationLog,
                { turnId: msg.turnId || nextTurnId, speaker: senderName, message: msg.message },
              ],
            };
          }
        }
      }

      updatedMemory = { ...updatedMemory, relationships: currentRels };
    }

    // (g) Generate memory summary if it is time
    if (shouldGenerateSummary(updatedMemory, nextTurnId)) {
      const summaryPrompt = generateMemorySummaryPrompt(updatedMemory);
      const summaryResponse = await callLLM(
        agent.model,
        'Ты — система суммаризации памяти. Напиши краткое резюме на русском языке.',
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
