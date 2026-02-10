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

export default function GameMap({ world, agents, selectedAgentId, onCellClick, currentTurn }: GameMapProps) {
  const grid = useMemo(() => {
    const agentMap = new Map<string, AgentState>();
    for (const agent of agents) {
      const key = `${agent.position.x},${agent.position.y}`;
      if (!agentMap.has(key)) agentMap.set(key, agent);
    }

    const objectMap = new Map<string, string>();
    for (const obj of world.objects) {
      const key = `${obj.position.x},${obj.position.y}`;
      if (!objectMap.has(key)) objectMap.set(key, obj.emoji);
    }

    let visibleSet: Set<string> | null = null;
    if (selectedAgentId) {
      const selectedAgent = agents.find((a) => a.id === selectedAgentId);
      if (selectedAgent) {
        const range = 2;
        visibleSet = new Set<string>();
        const ax = selectedAgent.position.x;
        const ay = selectedAgent.position.y;
        for (let vy = ay - range; vy <= ay + range; vy++) {
          for (let vx = ax - range; vx <= ax + range; vx++) {
            if (vx >= 0 && vx < world.width && vy >= 0 && vy < world.height) {
              if (Math.max(Math.abs(vx - ax), Math.abs(vy - ay)) <= range) {
                visibleSet.add(`${vx},${vy}`);
              }
            }
          }
        }
      }
    }

    const cells: React.ReactNode[] = [];
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const key = `${x},${y}`;
        const agent = agentMap.get(key);
        const objectEmoji = objectMap.get(key);
        const hasAgent = !!agent;
        const isVisible = visibleSet ? visibleSet.has(key) : false;

        const isDeadAgent = hasAgent && !agent!.alive;
        let className = 'grid-cell';
        if (hasAgent) className += ' agent-here';
        if (isVisible) className += ' visible';

        const emoji = agent ? agent.emoji : objectEmoji || '';

        cells.push(
          <div key={key} className={className} title={`${x}, ${y}${isDeadAgent ? ' (мёртв)' : ''}`} onClick={() => onCellClick?.(x, y)} style={isDeadAgent ? { opacity: 0.5, position: 'relative' } : undefined}>
            {emoji}{isDeadAgent && '💀'}
          </div>
        );
      }
    }
    return cells;
  }, [world, agents, selectedAgentId, onCellClick]);

  return (
    <div style={{ width: '100%', maxWidth: '720px' }}>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
        Ход: {currentTurn}
      </div>
      <div
        className="game-grid"
        style={{
          gridTemplateColumns: `repeat(${world.width}, 1fr)`,
          width: '100%',
          fontSize: 'clamp(0.7rem, 2.2vw, 1.1rem)',
        }}
      >
        {grid}
      </div>
    </div>
  );
}
