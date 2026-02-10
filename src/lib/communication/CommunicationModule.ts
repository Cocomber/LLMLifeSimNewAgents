import type {
  ChatMessage,
  AgentState,
  CommunicationMode,
  Position,
} from '@/types';

/**
 * Calculate the Euclidean distance between two positions.
 */
function distance(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Create a ChatMessage originating from `fromAgent`.
 *
 * If `toAgentId` is provided the message is a direct/private message;
 * otherwise it is a broadcast visible to anyone in range.
 */
export function createMessage(
  turnId: number,
  fromAgent: AgentState,
  message: string,
  toAgentId?: string,
): ChatMessage {
  return {
    turnId,
    fromAgentId: fromAgent.id,
    fromAgentName: fromAgent.name,
    toAgentId,
    message,
    position: { ...fromAgent.position },
  };
}

/**
 * Return the subset of `messages` that are visible to a given agent based on
 * the current CommunicationMode and proximity rules.
 *
 * Mode behaviour:
 *   - 'none'            -> no messages are visible (empty array)
 *   - 'signals'         -> agents communicate via placed objects, not chat (empty array)
 *   - 'speech'          -> messages within `range` distance, or directly addressed
 *   - 'custom_language' -> same rules as 'speech'
 */
export function getMessagesForAgent(
  messages: ChatMessage[],
  agentId: string,
  agentPosition: Position,
  range: number,
  mode: CommunicationMode,
  agentName?: string,
): ChatMessage[] {
  if (mode === 'none' || mode === 'signals') {
    return [];
  }

  // 'speech' and 'custom_language' use proximity-based filtering
  return messages.filter((msg) => {
    // Never show an agent its own messages
    if (msg.fromAgentId === agentId) {
      return false;
    }

    // Direct messages addressed to this agent by ID or by NAME are always visible
    if (msg.toAgentId === agentId) {
      return true;
    }
    if (agentName && msg.toAgentId && msg.toAgentId === agentName) {
      return true;
    }

    // Skip messages that are privately addressed to someone else
    if (msg.toAgentId && msg.toAgentId !== agentId && (!agentName || msg.toAgentId !== agentName)) {
      return false;
    }

    // Broadcast messages: check proximity
    return distance(msg.position, agentPosition) <= range;
  });
}

/**
 * Check whether two agents are able to communicate given the current mode
 * and their positions.
 *
 * - 'none'            -> always false
 * - 'signals'         -> always false (communication happens via world objects)
 * - 'speech'          -> true if within range
 * - 'custom_language' -> true if within range
 */
export function canCommunicate(
  mode: CommunicationMode,
  agent1Position: Position,
  agent2Position: Position,
  range: number,
): boolean {
  if (mode === 'none' || mode === 'signals') {
    return false;
  }

  return distance(agent1Position, agent2Position) <= range;
}
