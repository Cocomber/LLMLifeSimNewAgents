import type {
  AgentState,
  AgentAction,
  WorldState,
  InventoryItem,
  WorldObject,
  Position,
  ChatMessage,
  LLMAgentResponse,
} from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { isValidPosition, getObjectAt, addObject, removeObject } from './World';

// ==================== Individual Action Processors ====================

/**
 * Move an agent by a relative offset (dx, dy), clamping to grid bounds.
 */
export function processMove(
  agent: AgentState,
  dx: number,
  dy: number,
  world: WorldState
): AgentState {
  const newX = Math.max(0, Math.min(world.width - 1, agent.position.x + dx));
  const newY = Math.max(0, Math.min(world.height - 1, agent.position.y + dy));

  return {
    ...agent,
    position: { x: newX, y: newY },
  };
}

/**
 * Move an agent one step toward a target position (only 1 cell at a time in
 * the closest direction).
 */
export function processGoTo(
  agent: AgentState,
  targetX: number,
  targetY: number,
  world: WorldState
): AgentState {
  const dx = targetX - agent.position.x;
  const dy = targetY - agent.position.y;

  // Move at most 1 cell in each axis toward the target
  const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;

  const newX = Math.max(0, Math.min(world.width - 1, agent.position.x + stepX));
  const newY = Math.max(0, Math.min(world.height - 1, agent.position.y + stepY));

  return {
    ...agent,
    position: { x: newX, y: newY },
  };
}

/**
 * Agent searches a cell. For now just returns unchanged state. The LLM decides
 * what it finds via add_inventory actions. The target position must be within 2
 * cells of the agent.
 */
export function processSearch(
  agent: AgentState,
  x: number,
  y: number,
  world: WorldState
): { agent: AgentState; world: WorldState } {
  const dist = Math.abs(x - agent.position.x) + Math.abs(y - agent.position.y);
  if (dist > 2) {
    // Too far away, no effect
    return { agent, world };
  }

  return { agent, world };
}

/**
 * Add an item to the agent's inventory. If the item already exists, increase
 * its amount. Apply comfort change if specified.
 */
export function processAddInventory(
  agent: AgentState,
  item: string,
  amount: number,
  emoji: string,
  changeComfort?: number
): AgentState {
  const existingIndex = agent.inventory.findIndex((i) => i.name === item);
  let newInventory: InventoryItem[];

  if (existingIndex >= 0) {
    newInventory = agent.inventory.map((invItem, idx) =>
      idx === existingIndex
        ? { ...invItem, amount: invItem.amount + amount }
        : invItem
    );
  } else {
    newInventory = [
      ...agent.inventory,
      { name: item, emoji, amount },
    ];
  }

  let newComfort = agent.needs.comfort;
  if (changeComfort !== undefined) {
    newComfort = Math.max(0, Math.min(100, newComfort + changeComfort));
  }

  return {
    ...agent,
    inventory: newInventory,
    needs: {
      ...agent.needs,
      comfort: newComfort,
    },
  };
}

/**
 * Remove an item from inventory (decrease amount, remove entirely if amount
 * reaches 0). Apply hunger/thirst reduction if specified (clamped to 0-100).
 */
export function processRemoveInventory(
  agent: AgentState,
  item: string,
  amount: number,
  reduceHunger?: number,
  reduceThirst?: number
): AgentState {
  const existingIndex = agent.inventory.findIndex((i) => i.name === item);
  if (existingIndex < 0) {
    // Item not found, no change
    return agent;
  }

  let newInventory: InventoryItem[];
  const existing = agent.inventory[existingIndex];
  const newAmount = existing.amount - amount;

  if (newAmount <= 0) {
    newInventory = agent.inventory.filter((_, idx) => idx !== existingIndex);
  } else {
    newInventory = agent.inventory.map((invItem, idx) =>
      idx === existingIndex ? { ...invItem, amount: newAmount } : invItem
    );
  }

  let newHunger = agent.needs.hunger;
  let newThirst = agent.needs.thirst;

  if (reduceHunger !== undefined) {
    newHunger = Math.max(0, Math.min(100, newHunger - reduceHunger));
  }
  if (reduceThirst !== undefined) {
    newThirst = Math.max(0, Math.min(100, newThirst - reduceThirst));
  }

  return {
    ...agent,
    inventory: newInventory,
    needs: {
      ...agent.needs,
      hunger: newHunger,
      thirst: newThirst,
    },
  };
}

/**
 * Place a new object on the map at the specified position. The position must
 * be within 2 cells of the agent. Sets placedByAgent to the agent's id.
 */
export function processPlaceObject(
  agent: AgentState,
  world: WorldState,
  x: number,
  y: number,
  objectName: string,
  emoji: string
): WorldState {
  const dist = Math.abs(x - agent.position.x) + Math.abs(y - agent.position.y);
  if (dist > 2) {
    return world;
  }

  if (!isValidPosition(world, x, y)) {
    return world;
  }

  const newObject: WorldObject = {
    id: uuidv4(),
    type: objectName,
    emoji,
    position: { x, y },
    placedByAgent: agent.id,
  };

  return addObject(world, newObject);
}

/**
 * Remove the first object at the given position from the map. The position
 * must be within 2 cells of the agent.
 */
export function processRemoveObject(
  agent: AgentState,
  world: WorldState,
  x: number,
  y: number
): WorldState {
  const dist = Math.abs(x - agent.position.x) + Math.abs(y - agent.position.y);
  if (dist > 2) {
    return world;
  }

  const objectsAtPos = getObjectAt(world, { x, y });
  if (objectsAtPos.length === 0) {
    return world;
  }

  // Remove the first matching object at that position
  return removeObject(world, objectsAtPos[0].id);
}

// ==================== Needs Decay ====================

/**
 * Apply per-turn needs decay to an agent. Hunger and thirst increase, comfort
 * decreases. All values are clamped between 0 and 100. If hunger or thirst
 * reach 100, the agent dies.
 */
export function applyNeedsDecay(
  agent: AgentState,
  hungerRate: number,
  thirstRate: number,
  comfortRate: number
): AgentState {
  const newHunger = Math.max(0, Math.min(100, agent.needs.hunger + hungerRate));
  const newThirst = Math.max(0, Math.min(100, agent.needs.thirst + thirstRate));
  const newComfort = Math.max(0, Math.min(100, agent.needs.comfort - comfortRate));

  const alive = agent.alive && newHunger < 100 && newThirst < 100;

  return {
    ...agent,
    needs: {
      hunger: newHunger,
      thirst: newThirst,
      comfort: newComfort,
    },
    alive,
  };
}

// ==================== Batch Action Processing ====================

/**
 * Process an array of actions for an agent (max 3 per turn). Returns updated
 * agent state, updated world state, and any chat messages generated.
 */
export function processActions(
  agent: AgentState,
  actions: AgentAction[],
  world: WorldState,
  allAgents: AgentState[]
): {
  updatedAgent: AgentState;
  updatedWorld: WorldState;
  messages: ChatMessage[];
  turnId: number;
} {
  let currentAgent = { ...agent };
  let currentWorld = { ...world };
  const messages: ChatMessage[] = [];

  // Limit to 3 actions per turn
  const limitedActions = actions.slice(0, 3);

  for (const action of limitedActions) {
    switch (action.type) {
      case 'move': {
        const [dx, dy] = action.target;
        currentAgent = processMove(currentAgent, dx, dy, currentWorld);
        break;
      }

      case 'go_to': {
        const [targetX, targetY] = action.target;
        currentAgent = processGoTo(currentAgent, targetX, targetY, currentWorld);
        break;
      }

      case 'search': {
        const [sx, sy] = action.target;
        const result = processSearch(currentAgent, sx, sy, currentWorld);
        currentAgent = result.agent;
        currentWorld = result.world;
        break;
      }

      case 'add_inventory': {
        const { item, amount, emoji, change_comfort } = action.target;
        currentAgent = processAddInventory(
          currentAgent,
          item,
          amount,
          emoji,
          change_comfort
        );
        break;
      }

      case 'remove_inventory': {
        const { item, amount, reduce_hunger, reduce_thirst } = action.target;
        currentAgent = processRemoveInventory(
          currentAgent,
          item,
          amount,
          reduce_hunger,
          reduce_thirst
        );
        break;
      }

      case 'place_object': {
        const { x, y, object: objectName, emoji } = action.target;
        currentWorld = processPlaceObject(
          currentAgent,
          currentWorld,
          x,
          y,
          objectName,
          emoji
        );
        break;
      }

      case 'remove_object': {
        const { x, y } = action.target;
        currentWorld = processRemoveObject(currentAgent, currentWorld, x, y);
        break;
      }

      case 'communicate': {
        const { message, to_agent } = action.target;
        const chatMessage: ChatMessage = {
          turnId: 0, // Will be set by the caller
          fromAgentId: currentAgent.id,
          fromAgentName: currentAgent.name,
          ...(to_agent ? { toAgentId: to_agent } : {}),
          message,
          position: { ...currentAgent.position },
        };
        messages.push(chatMessage);
        break;
      }

      case 'idle':
      default:
        // No-op
        break;
    }
  }

  return {
    updatedAgent: currentAgent,
    updatedWorld: currentWorld,
    messages,
    turnId: 0,
  };
}

// ==================== Full Response Processing ====================

/**
 * Process a complete LLM response for an agent. Updates goals, processes all
 * actions, applies needs decay, and creates chat messages.
 */
export function processFullResponse(
  agent: AgentState,
  response: LLMAgentResponse,
  world: WorldState,
  allAgents: AgentState[],
  turnId: number,
  hungerRate: number,
  thirstRate: number,
  comfortRate: number
): {
  updatedAgent: AgentState;
  updatedWorld: WorldState;
  messages: ChatMessage[];
} {
  let currentAgent = { ...agent };

  // Update goals from response
  if (response.goal && response.goal.trim() !== '') {
    currentAgent = {
      ...currentAgent,
      globalGoal: response.goal,
    };
  }

  currentAgent = {
    ...currentAgent,
    localGoal: response.local_goal,
  };

  // Process actions (max 3)
  const actionsToProcess = (response.actions || []).slice(0, 3) as AgentAction[];
  const {
    updatedAgent: agentAfterActions,
    updatedWorld: worldAfterActions,
    messages,
  } = processActions(currentAgent, actionsToProcess, world, allAgents);

  // Apply needs decay
  const agentAfterDecay = applyNeedsDecay(
    agentAfterActions,
    hungerRate,
    thirstRate,
    comfortRate
  );

  // Set turnId on all messages
  for (const msg of messages) {
    msg.turnId = turnId;
  }

  // Create a chat message if message_to_others exists and is non-empty
  if (response.message_to_others && response.message_to_others.trim() !== '') {
    messages.push({
      turnId,
      fromAgentId: agentAfterDecay.id,
      fromAgentName: agentAfterDecay.name,
      message: response.message_to_others,
      position: { ...agentAfterDecay.position },
    });
  }

  return {
    updatedAgent: agentAfterDecay,
    updatedWorld: worldAfterActions,
    messages,
  };
}
