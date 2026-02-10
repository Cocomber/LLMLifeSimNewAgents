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

export default function AgentPanel({
  agents,
  selectedAgentId,
  onSelectAgent,
  onOpenDetail,
}: AgentPanelProps) {
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
            {/* Dead overlay */}
            {!agent.alive && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.55)',
                  borderRadius: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2.5rem',
                  zIndex: 2,
                  pointerEvents: 'none',
                }}
              >
                💀
              </div>
            )}

            {/* Header: emoji + name + model */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '1.5rem' }}>{agent.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.2 }}>
                  {agent.name}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  {LLM_MODEL_LABELS[agent.model] ?? agent.model}
                </div>
              </div>
            </div>

            {/* Status bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
              {/* Hunger */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', width: '52px', flexShrink: 0 }}>
                  Голод
                </span>
                <div className="status-bar" style={{ flex: 1 }}>
                  <div
                    className="status-bar-fill"
                    style={{
                      width: `${agent.needs.hunger}%`,
                      backgroundColor: '#ef4444',
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', width: '26px', textAlign: 'right', flexShrink: 0 }}>
                  {Math.round(agent.needs.hunger)}
                </span>
              </div>

              {/* Thirst */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', width: '52px', flexShrink: 0 }}>
                  Жажда
                </span>
                <div className="status-bar" style={{ flex: 1 }}>
                  <div
                    className="status-bar-fill"
                    style={{
                      width: `${agent.needs.thirst}%`,
                      backgroundColor: '#3b82f6',
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', width: '26px', textAlign: 'right', flexShrink: 0 }}>
                  {Math.round(agent.needs.thirst)}
                </span>
              </div>

              {/* Comfort */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', width: '52px', flexShrink: 0 }}>
                  Комфорт
                </span>
                <div className="status-bar" style={{ flex: 1 }}>
                  <div
                    className="status-bar-fill"
                    style={{
                      width: `${agent.needs.comfort}%`,
                      backgroundColor: '#22c55e',
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', width: '26px', textAlign: 'right', flexShrink: 0 }}>
                  {Math.round(agent.needs.comfort)}
                </span>
              </div>
            </div>

            {/* Global goal */}
            {agent.globalGoal && (
              <div style={{ fontSize: '0.72rem', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Цель: </span>
                <span>{truncate(agent.globalGoal, 60)}</span>
              </div>
            )}

            {/* Local goal */}
            {agent.localGoal && (
              <div style={{ fontSize: '0.72rem', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Задача: </span>
                <span>{truncate(agent.localGoal, 60)}</span>
              </div>
            )}

            {/* Thought bubble */}
            {agent.localGoal && (
              <div className="thought-bubble">
                {truncate(agent.localGoal, 80)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
