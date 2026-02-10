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
    try {
      const target = action.target;
      switch (action.type) {
        case 'move': {
          // Support both array [dx, dy] and object {x, y} / {dx, dy} formats
          let dx = 0, dy = 0;
          if (Array.isArray(target)) {
            dx = Number(target[0]) || 0;
            dy = Number(target[1]) || 0;
          } else if (target && typeof target === 'object') {
            dx = Number((target as any).dx ?? (target as any).x ?? 0);
            dy = Number((target as any).dy ?? (target as any).y ?? 0);
          }
          // Clamp to -1..1 for move
          dx = Math.max(-1, Math.min(1, dx));
          dy = Math.max(-1, Math.min(1, dy));
          currentAgent = processMove(currentAgent, dx, dy, currentWorld);
          break;
        }

        case 'go_to': {
          // Support both array [x, y] and object {x, y} formats
          let targetX = 0, targetY = 0;
          if (Array.isArray(target)) {
            targetX = Number(target[0]) || 0;
            targetY = Number(target[1]) || 0;
          } else if (target && typeof target === 'object') {
            targetX = Number((target as any).x ?? 0);
            targetY = Number((target as any).y ?? 0);
          }
          currentAgent = processGoTo(currentAgent, targetX, targetY, currentWorld);
          break;
        }

        case 'search': {
          let sx = 0, sy = 0;
          if (Array.isArray(target)) {
            sx = Number(target[0]) || 0;
            sy = Number(target[1]) || 0;
          } else if (target && typeof target === 'object') {
            sx = Number((target as any).x ?? 0);
            sy = Number((target as any).y ?? 0);
          }
          const result = processSearch(currentAgent, sx, sy, currentWorld);
          currentAgent = result.agent;
          currentWorld = result.world;
          break;
        }

        case 'add_inventory': {
          if (target && typeof target === 'object') {
            const t = target as any;
            const item = String(t.item || 'предмет');
            const amount = Number(t.amount) || 1;
            const emoji = String(t.emoji || '📦');
            const change_comfort = t.change_comfort !== undefined ? Number(t.change_comfort) : undefined;
            currentAgent = processAddInventory(
              currentAgent,
              item,
              amount,
              emoji,
              change_comfort
            );
          }
          break;
        }

        case 'remove_inventory': {
          if (target && typeof target === 'object') {
            const t = target as any;
            const item = String(t.item || '');
            const amount = Number(t.amount) || 1;
            let reduce_hunger = t.reduce_hunger !== undefined ? Number(t.reduce_hunger) : undefined;
            let reduce_thirst = t.reduce_thirst !== undefined ? Number(t.reduce_thirst) : undefined;

            // Fallback: if LLM didn't provide reduce_hunger/reduce_thirst, infer from item name
            if (reduce_hunger === undefined && reduce_thirst === undefined) {
              const itemLower = item.toLowerCase();
              const emojiStr = String(t.emoji || '');
              // Food items: berries, meat, fish, mushrooms, etc.
              if (itemLower.match(/ягод|берр|berry|гриб|mushroom|мяс|meat|рыб|fish|фрукт|fruit|яблок|apple|орех|nut|хлеб|bread|еда|food/) || emojiStr.match(/🍓|🍎|🍖|🍗|🐟|🍄|🫐|🍇|🥜|🍞|🥩/)) {
                reduce_hunger = 10 * amount;
                reduce_thirst = 3 * amount;
              }
              // Water/drink items
              else if (itemLower.match(/вод[аыуе]|water|напит|drink|сок|juice/) || emojiStr.match(/💧|🥤|🧃|🫗/)) {
                reduce_thirst = 25 * amount;
              }
            }

            currentAgent = processRemoveInventory(
              currentAgent,
              item,
              amount,
              reduce_hunger,
              reduce_thirst
            );
          }
          break;
        }

        case 'place_object': {
          if (target && typeof target === 'object') {
            const t = target as any;
            const x = Number(t.x ?? 0);
            const y = Number(t.y ?? 0);
            const objectName = String(t.object || t.name || 'объект');
            const emoji = String(t.emoji || '📦');
            currentWorld = processPlaceObject(
              currentAgent,
              currentWorld,
              x,
              y,
              objectName,
              emoji
            );
          }
          break;
        }

        case 'remove_object': {
          if (target && typeof target === 'object') {
            const t = target as any;
            const x = Number(t.x ?? 0);
            const y = Number(t.y ?? 0);
            currentWorld = processRemoveObject(currentAgent, currentWorld, x, y);
          }
          break;
        }

        case 'idle':
        default:
          // No-op
          break;
      }
    } catch (e) {
      // Skip malformed actions silently
      console.warn('Skipping malformed action:', action, e);
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

  // Only update localGoal from response. globalGoal is controlled exclusively by the player.
  currentAgent = {
    ...currentAgent,
    localGoal: response.local_goal,
  };

  // Process physical actions (max 3)
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

  // Process the "messages" field (separate from actions, up to 3)
  if (response.messages && Array.isArray(response.messages)) {
    const seen = new Set<string>();
    const msgs = response.messages.slice(0, 3);
    for (const m of msgs) {
      if (!m || !m.message || typeof m.message !== 'string' || !m.message.trim()) continue;
      // Dedup: skip if exact same text already added
      const key = m.message.trim();
      if (seen.has(key)) continue;
      seen.add(key);
      messages.push({
        turnId,
        fromAgentId: agentAfterDecay.id,
        fromAgentName: agentAfterDecay.name,
        ...(m.to_agent ? { toAgentId: String(m.to_agent) } : {}),
        message: m.message,
        position: { ...agentAfterDecay.position },
      });
    }
  }

  return {
    updatedAgent: agentAfterDecay,
    updatedWorld: worldAfterActions,
    messages,
  };
}
