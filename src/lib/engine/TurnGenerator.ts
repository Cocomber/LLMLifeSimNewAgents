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
import { callLLM, callLLMWithStatus } from '../llm/providers';
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

    // Skip paused agents
    if (agent.paused) {
      // Record a minimal turn so UI shows the agent is paused
      agentTurns[agent.id] = {
        needs: { ...agent.needs },
        position: { ...agent.position },
        inventory: [...agent.inventory],
        thought: '⏸️ Агент приостановлен',
        actions: [{ type: 'idle', target: null }],
        narrativeEvent: 'Стоит неподвижно, словно заморожен во времени.',
        globalGoal: agent.globalGoal,
        localGoal: agent.localGoal,
      };
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

    // (d) Call the LLM with status tracking
    const llmResult = await callLLMWithStatus(
      agent.model,
      systemPrompt,
      userPrompt,
      gameState.apiKeys,
    );
    const llmResponse: LLMAgentResponse = llmResult.response;

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

    // (f3) Store conversation messages in relationship logs
    //
    // Design: speech is public, so we log:
    //   A) Messages this agent SENT this turn (from agentMessages)
    //   B) Messages this agent HEARD — from allTurnMessages (agents processed
    //      earlier this turn) + previous turn history (agents processed after
    //      us last turn). Dedup by (relName, turnId, speaker, messageSlice).
    {
      const currentRels = { ...(updatedMemory.relationships || {}) };

      // Dedup set from existing conversation entries
      const logged = new Set<string>();
      for (const relName of Object.keys(currentRels)) {
        for (const entry of currentRels[relName].conversationLog) {
          logged.add(`${relName}|${entry.turnId}|${entry.speaker}|${entry.message.slice(0, 80)}`);
        }
      }

      const ensureRel = (relName: string) => {
        if (!currentRels[relName]) {
          currentRels[relName] = {
            name: relName,
            description: 'Кто-то поблизости',
            attitude: 'нейтральный',
            lastSeenTurn: nextTurnId,
            conversationLog: [],
          };
        }
      };

      const addEntry = (relName: string, turnId: number, speaker: string, message: string) => {
        const key = `${relName}|${turnId}|${speaker}|${message.slice(0, 80)}`;
        if (logged.has(key)) return;
        logged.add(key);
        ensureRel(relName);
        currentRels[relName] = {
          ...currentRels[relName],
          lastSeenTurn: nextTurnId,
          conversationLog: [
            ...currentRels[relName].conversationLog,
            { turnId, speaker, message },
          ],
        };
      };

      // Helper: resolve "Незнакомец" or partial names to actual agent name
      const resolveRecipient = (toAgentId: string): string | undefined => {
        // Direct match by id or name
        const byMatch = updatedAgents.find(
          (a) => a.id === toAgentId || a.name === toAgentId
        );
        if (byMatch && byMatch.id !== agent.id) return byMatch.name;

        // "Незнакомец" → find nearest visible agent NOT already in relationships
        if (toAgentId.includes('Незнакомец') || toAgentId.includes('незнакомец')) {
          const knownNames = new Set(Object.keys(currentRels));
          const candidates = updatedAgents
            .filter((a) => a.id !== agent.id && a.alive && !knownNames.has(a.name))
            .map((a) => ({
              name: a.name,
              dist: Math.sqrt(
                (a.position.x - updatedAgent.position.x) ** 2 +
                (a.position.y - updatedAgent.position.y) ** 2
              ),
            }))
            .filter((c) => c.dist <= gameState.settings.visibilityRange)
            .sort((a, b) => a.dist - b.dist);
          if (candidates.length > 0) return candidates[0].name;
        }

        return undefined;
      };

      // --- A) Messages this agent SENT ---
      for (const msg of agentMessages) {
        if (!msg.message?.trim()) continue;
        if (msg.toAgentId) {
          // Directed message: log under the resolved recipient
          const resolved = resolveRecipient(msg.toAgentId);
          if (resolved) {
            addEntry(resolved, nextTurnId, agent.name, msg.message);
          }
        }
        // Broadcasts: not logged under a specific relationship
      }

      // --- B) Messages this agent HEARD ---
      // Sources: current turn (agents already processed) + previous turn
      //          (agents processed after us last time).
      const prevTurnMsgs: ChatMessage[] = [];
      if (gameState.turnHistory.length > 0) {
        prevTurnMsgs.push(...gameState.turnHistory[gameState.turnHistory.length - 1].messages);
      }

      const allHearable = [...prevTurnMsgs, ...allTurnMessages].filter((msg) => {
        if (msg.fromAgentId === agent.id) return false;
        const dist = Math.sqrt(
          (msg.position.x - updatedAgent.position.x) ** 2 +
          (msg.position.y - updatedAgent.position.y) ** 2
        );
        return dist <= gameState.settings.visibilityRange;
      });

      for (const msg of allHearable) {
        addEntry(
          msg.fromAgentName,
          msg.turnId || nextTurnId,
          msg.fromAgentName,
          msg.message,
        );
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

    // Store updated agent with new memory and health status
    const finalAgent: AgentState = {
      ...updatedAgent,
      memory: updatedMemory,
      // Track LLM call health
      errorCount: llmResult.success ? 0 : (agent.errorCount || 0) + 1,
      lastError: llmResult.success ? undefined : llmResult.error,
      lastErrorTurn: llmResult.success ? agent.lastErrorTurn : nextTurnId,
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
