'use client';

import React, { useMemo } from 'react';
import type { WorldState, AgentState, Position } from '@/types';

interface GameMapProps {
  world: WorldState;
  agents: AgentState[];
  selectedAgentId: string | null;
  onCellClick?: (x: number, y: number) => void;
  currentTurn: number;
}

export default function GameMap({
  world,
  agents,
  selectedAgentId,
  onCellClick,
  currentTurn,
}: GameMapProps) {
  const grid = useMemo(() => {
    // Build lookup maps for fast access
    const agentMap = new Map<string, AgentState>();
    for (const agent of agents) {
      if (agent.alive) {
        const key = `${agent.position.x},${agent.position.y}`;
        // If multiple agents at same position, first one wins
        if (!agentMap.has(key)) {
          agentMap.set(key, agent);
        }
      }
    }

    const objectMap = new Map<string, string>();
    for (const obj of world.objects) {
      const key = `${obj.position.x},${obj.position.y}`;
      // If multiple objects at same position, first one wins
      if (!objectMap.has(key)) {
        objectMap.set(key, obj.emoji);
      }
    }

    // Find selected agent and compute visibility set
    let visibleSet: Set<string> | null = null;
    if (selectedAgentId) {
      const selectedAgent = agents.find((a) => a.id === selectedAgentId);
      if (selectedAgent) {
        const range = 2; // default visibilityRange
        visibleSet = new Set<string>();
        const ax = selectedAgent.position.x;
        const ay = selectedAgent.position.y;
        for (let vy = ay - range; vy <= ay + range; vy++) {
          for (let vx = ax - range; vx <= ax + range; vx++) {
            if (vx >= 0 && vx < world.width && vy >= 0 && vy < world.height) {
              const dist = Math.max(Math.abs(vx - ax), Math.abs(vy - ay));
              if (dist <= range) {
                visibleSet.add(`${vx},${vy}`);
              }
            }
          }
        }
      }
    }

    // Build cells row by row (y outer, x inner)
    const cells: React.ReactNode[] = [];
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const key = `${x},${y}`;
        const agent = agentMap.get(key);
        const objectEmoji = objectMap.get(key);

        const hasAgent = !!agent;
        const isVisible = visibleSet ? visibleSet.has(key) : false;

        let className = 'grid-cell';
        if (hasAgent) className += ' agent-here';
        if (isVisible) className += ' visible';

        // Agent emoji takes priority over object emoji
        const emoji = agent ? agent.emoji : objectEmoji || '';

        cells.push(
          <div
            key={key}
            className={className}
            title={`${x}, ${y}`}
            onClick={() => onCellClick?.(x, y)}
          >
            {emoji}
          </div>
        );
      }
    }

    return cells;
  }, [world, agents, selectedAgentId, onCellClick]);

  return (
    <div>
      <div
        style={{
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          marginBottom: '6px',
          fontWeight: 500,
        }}
      >
        {"Ход: "}{currentTurn}
      </div>
      <div
        className="game-grid"
        style={{
          gridTemplateColumns: `repeat(${world.width}, 1fr)`,
        }}
      >
        {grid}
      </div>
    </div>
  );
}
