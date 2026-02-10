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
 * `toAgentId` is a social annotation (who the speaker is addressing) but
 * does NOT make the message private — everyone in range hears it.
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
 * Return the subset of `messages` that are audible to a given agent.
 *
 * IMPORTANT: Speech is PUBLIC. If you are within hearing range you hear
 * everything, regardless of who the speaker is addressing (`to_agent`).
 * The `to_agent` field is purely social context shown in the prompt so the
 * listener knows who is being spoken to, but it never prevents delivery.
 *
 * Mode behaviour:
 *   - 'none'            -> no messages (empty array)
 *   - 'signals'         -> no messages (communicate via objects)
 *   - 'speech'          -> all messages within `range` distance
 *   - 'custom_language' -> same as 'speech'
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

  // Speech is public: everyone within hearing range hears ALL messages.
  return messages.filter((msg) => {
    // Never show an agent its own messages
    if (msg.fromAgentId === agentId) {
      return false;
    }

    // Within hearing range? Then you hear it.
    return distance(msg.position, agentPosition) <= range;
  });
}

/**
 * Check whether two agents are able to communicate given the current mode
 * and their positions.
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
