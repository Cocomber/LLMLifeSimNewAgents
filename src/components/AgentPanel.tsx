'use client';

import React from 'react';
import type { AgentState } from '@/types';
import { LLM_MODEL_LABELS } from '@/types';

interface AgentPanelProps {
  agents: AgentState[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  onOpenDetail: (agentId: string) => void;
}

function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

export default function AgentPanel({ agents, selectedAgentId, onSelectAgent, onOpenDetail }: AgentPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {agents.map((agent) => {
        const isSelected = agent.id === selectedAgentId;
        return (
          <div
            key={agent.id}
            className="agent-card"
            style={{
              borderColor: isSelected ? agent.color : undefined,
              borderWidth: isSelected ? '2px' : undefined,
              position: 'relative',
              opacity: agent.alive ? 1 : 0.6,
            }}
            onClick={() => onSelectAgent(isSelected ? null : agent.id)}
            onDoubleClick={() => onOpenDetail(agent.id)}
          >
            {!agent.alive && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', borderRadius: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', zIndex: 2, pointerEvents: 'none' }}>
                💀
              </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '1.5rem' }}>{agent.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.2 }}>{agent.name}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{LLM_MODEL_LABELS[agent.model] ?? agent.model}</div>
              </div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>
                ({agent.position.x}, {agent.position.y})
              </span>
            </div>

            {/* Status bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '8px' }}>
              {[
                { label: 'Голод', value: agent.needs.hunger, color: '#ef4444' },
                { label: 'Жажда', value: agent.needs.thirst, color: '#3b82f6' },
                { label: 'Комфорт', value: agent.needs.comfort, color: '#22c55e' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', width: '52px', flexShrink: 0 }}>{label}</span>
                  <div className="status-bar" style={{ flex: 1 }}>
                    <div className="status-bar-fill" style={{ width: `${value}%`, backgroundColor: color }} />
                  </div>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', width: '26px', textAlign: 'right', flexShrink: 0 }}>{Math.round(value)}</span>
                </div>
              ))}
            </div>

            {/* Goals */}
            <div style={{ fontSize: '0.72rem', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Цель: </span>
              <span style={{ fontWeight: 600 }}>{truncate(agent.globalGoal, 50)}</span>
            </div>
            {agent.localGoal && (
              <div style={{ fontSize: '0.72rem', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Задача: </span>
                <span>{truncate(agent.localGoal, 50)}</span>
              </div>
            )}

            {/* Inventory */}
            {agent.inventory.length > 0 && (
              <div style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>Инвентарь:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                  {agent.inventory.slice(0, 8).map((item, idx) => (
                    <span key={`${item.name}-${idx}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', background: 'var(--bg-tertiary)', padding: '2px 5px', borderRadius: '4px', fontSize: '0.68rem' }} title={`${item.name} x${item.amount}`}>
                      {item.emoji} <span style={{ color: 'var(--text-secondary)' }}>x{item.amount}</span>
                    </span>
                  ))}
                  {agent.inventory.length > 8 && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', padding: '2px 4px' }}>+{agent.inventory.length - 8}</span>
                  )}
                </div>
              </div>
            )}

            {/* Last thought/narrative */}
            {agent.memory.recentTurns.length > 0 && (
              <div className="thought-bubble" style={{ marginTop: '4px' }}>
                {truncate(agent.memory.recentTurns[agent.memory.recentTurns.length - 1]?.narrativeEvent || agent.localGoal, 90)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
