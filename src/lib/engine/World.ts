import { v4 as uuidv4 } from 'uuid';
import type { Position, WorldObject, WorldState, AgentState } from '@/types';

// ==================== Helper Utilities ====================

/**
 * Returns a random integer between min (inclusive) and max (inclusive).
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Calculates the Euclidean distance between two positions.
 */
function distance(a: Position, b: Position): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Returns a cardinal/intercardinal direction string from `from` to `to`.
 */
function getDirection(from: Position, to: Position): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (dx === 0 && dy === 0) return 'here';

  // In grid coordinates, y increases downward, so positive dy = south
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  if (angle >= -22.5 && angle < 22.5) return 'east';
  if (angle >= 22.5 && angle < 67.5) return 'southeast';
  if (angle >= 67.5 && angle < 112.5) return 'south';
  if (angle >= 112.5 && angle < 157.5) return 'southwest';
  if (angle >= 157.5 || angle < -157.5) return 'west';
  if (angle >= -157.5 && angle < -112.5) return 'northwest';
  if (angle >= -112.5 && angle < -67.5) return 'north';
  if (angle >= -67.5 && angle < -22.5) return 'northeast';

  return 'nearby';
}

/**
 * Checks whether a position is too close to any existing positions.
 * Used during world generation to spread objects apart.
 */
function isTooClose(
  pos: Position,
  existing: Position[],
  minDistance: number
): boolean {
  return existing.some((e) => distance(pos, e) < minDistance);
}

/**
 * Generates a random position on the grid that maintains a minimum distance
 * from all already-placed positions. Falls back to any valid position after
 * a number of attempts to avoid infinite loops.
 */
function findSpreadPosition(
  width: number,
  height: number,
  placed: Position[],
  minDistance: number,
  maxAttempts: number = 100
): Position {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pos: Position = {
      x: randomInt(0, width - 1),
      y: randomInt(0, height - 1),
    };
    if (!isTooClose(pos, placed, minDistance)) {
      return pos;
    }
  }
  // Fallback: return a random position without distance constraint
  return {
    x: randomInt(0, width - 1),
    y: randomInt(0, height - 1),
  };
}

// ==================== Object Placement Definitions ====================

interface ObjectPlacementConfig {
  type: string;
  emoji: string;
  minCount: number;
  maxCount: number;
  minSpread: number;
  properties?: Record<string, any>;
}

const OBJECT_PLACEMENTS: ObjectPlacementConfig[] = [
  { type: 'tree', emoji: '🌳', minCount: 15, maxCount: 20, minSpread: 2 },
  { type: 'bush', emoji: '🌿', minCount: 8, maxCount: 12, minSpread: 2 },
  { type: 'water', emoji: '💧', minCount: 3, maxCount: 5, minSpread: 4, properties: { drinkable: true } },
  { type: 'berry', emoji: '🍓', minCount: 6, maxCount: 10, minSpread: 3, properties: { edible: true } },
  { type: 'deer', emoji: '🦌', minCount: 2, maxCount: 2, minSpread: 5, properties: { alive: true, edible: true } },
  { type: 'mountain', emoji: '⛰️', minCount: 1, maxCount: 1, minSpread: 6, properties: { climbable: true } },
  { type: 'stone', emoji: '🗿', minCount: 4, maxCount: 7, minSpread: 3, properties: { collectible: true } },
  { type: 'cave', emoji: '🏔️', minCount: 1, maxCount: 1, minSpread: 6, properties: { shelter: true } },
];

// ==================== World Generation ====================

/**
 * Generates an initial world state with the given dimensions and randomly
 * placed objects. Objects are spread across the grid to avoid clustering.
 */
export function generateWorld(width: number, height: number): WorldState {
  const objects: WorldObject[] = [];
  const placedPositions: Position[] = [];

  for (const config of OBJECT_PLACEMENTS) {
    const count = randomInt(config.minCount, config.maxCount);

    for (let i = 0; i < count; i++) {
      const position = findSpreadPosition(
        width,
        height,
        placedPositions,
        config.minSpread
      );

      const obj: WorldObject = {
        id: uuidv4(),
        type: config.type,
        emoji: config.emoji,
        position,
        ...(config.properties ? { properties: { ...config.properties } } : {}),
      };

      objects.push(obj);
      placedPositions.push(position);
    }
  }

  return {
    width,
    height,
    objects,
  };
}

// ==================== Querying ====================

/**
 * Returns all objects visible from a given position within the specified range.
 * Uses Euclidean distance for the visibility check.
 */
export function getVisibleObjects(
  world: WorldState,
  position: Position,
  range: number
): WorldObject[] {
  return world.objects.filter(
    (obj) => distance(position, obj.position) <= range
  );
}

/**
 * Formats the visible area around the current agent as a text description
 * suitable for inclusion in an LLM prompt. Lists nearby objects and other
 * agents with their direction and distance.
 */
export function getVisibleArea(
  world: WorldState,
  agents: AgentState[],
  currentAgentId: string,
  range: number
): string {
  const currentAgent = agents.find((a) => a.id === currentAgentId);
  if (!currentAgent) {
    return 'Ты ничего не видишь (агент не найден).';
  }

  const pos = currentAgent.position;
  const lines: string[] = [];

  const directionLabels: Record<string, string> = {
    'north': 'на севере',
    'south': 'на юге',
    'east': 'на востоке',
    'west': 'на западе',
    'northeast': 'на северо-востоке',
    'northwest': 'на северо-западе',
    'southeast': 'на юго-востоке',
    'southwest': 'на юго-западе',
    'here': 'здесь',
    'nearby': 'рядом',
  };

  lines.push(
    `Ты находишься на позиции (${pos.x}, ${pos.y}) на карте ${world.width}x${world.height}.`
  );
  lines.push(`Дальность видимости: ${range} клеток.`);
  lines.push('');

  // Visible objects
  const visibleObjects = getVisibleObjects(world, pos, range);

  if (visibleObjects.length > 0) {
    lines.push('Ближайшие объекты:');
    for (const obj of visibleObjects) {
      const dist = Math.round(distance(pos, obj.position) * 10) / 10;
      const dir = getDirection(pos, obj.position);
      const dirLabel = directionLabels[dir] || dir;
      const atSameSpot = obj.position.x === pos.x && obj.position.y === pos.y;

      if (atSameSpot) {
        lines.push(
          `  ${obj.emoji} ${obj.type} — на твоей клетке (${obj.position.x}, ${obj.position.y})`
        );
      } else {
        lines.push(
          `  ${obj.emoji} ${obj.type} — ${dist} кл. ${dirLabel}, позиция (${obj.position.x}, ${obj.position.y})`
        );
      }
    }
  } else {
    lines.push('Рядом нет видимых объектов.');
  }

  // Visible agents
  const visibleAgents = agents.filter((a) => {
    if (a.id === currentAgentId) return false;
    if (!a.alive) return false;
    return distance(pos, a.position) <= range;
  });

  if (visibleAgents.length > 0) {
    lines.push('');
    lines.push('Ближайшие персонажи:');
    for (const agent of visibleAgents) {
      const dist = Math.round(distance(pos, agent.position) * 10) / 10;
      const dir = getDirection(pos, agent.position);
      const dirLabel = directionLabels[dir] || dir;
      const atSameSpot =
        agent.position.x === pos.x && agent.position.y === pos.y;

      if (atSameSpot) {
        lines.push(
          `  ${agent.emoji} ${agent.name} — на твоей клетке (${agent.position.x}, ${agent.position.y})`
        );
      } else {
        lines.push(
          `  ${agent.emoji} ${agent.name} — ${dist} кл. ${dirLabel}, позиция (${agent.position.x}, ${agent.position.y})`
        );
      }
    }
  }

  return lines.join('\n');
}

// ==================== World Mutation ====================

/**
 * Returns a new WorldState with the given object added.
 */
export function addObject(world: WorldState, obj: WorldObject): WorldState {
  return {
    ...world,
    objects: [...world.objects, obj],
  };
}

/**
 * Returns a new WorldState with the specified object removed.
 */
export function removeObject(world: WorldState, objectId: string): WorldState {
  return {
    ...world,
    objects: world.objects.filter((obj) => obj.id !== objectId),
  };
}

// ==================== Position Queries ====================

/**
 * Returns all objects at the exact given position.
 */
export function getObjectAt(
  world: WorldState,
  position: Position
): WorldObject[] {
  return world.objects.filter(
    (obj) => obj.position.x === position.x && obj.position.y === position.y
  );
}

/**
 * Checks whether the given (x, y) coordinates fall within the world bounds.
 */
export function isValidPosition(
  world: WorldState,
  x: number,
  y: number
): boolean {
  return x >= 0 && x < world.width && y >= 0 && y < world.height;
}
