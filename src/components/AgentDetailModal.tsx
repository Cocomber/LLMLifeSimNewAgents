'use client';

import React, { useState, useMemo } from 'react';
import type { AgentState, InventoryItem, TurnRecord, AgentAction, AgentRelationship } from '@/types';
import { LLM_MODEL_LABELS } from '@/types';

interface AgentDetailModalProps {
  agent: AgentState;
  turnHistory: TurnRecord[];
  onClose: () => void;
  onGoalChange: (agentId: string, newGoal: string) => void;
}

function formatAction(action: AgentAction): string {
  if (!action || !action.type) return 'Неизвестно';
  switch (action.type) {
    case 'move': return `Движение (${action.target?.[0]}, ${action.target?.[1]})`;
    case 'go_to': return `Идти к (${action.target?.[0]}, ${action.target?.[1]})`;
    case 'search': return `Поиск (${action.target?.[0]}, ${action.target?.[1]})`;
    case 'add_inventory': return `Взять ${action.target?.emoji || ''} ${action.target?.item || ''} x${action.target?.amount || 1}`;
    case 'remove_inventory': return `Использовать ${action.target?.emoji || ''} ${action.target?.item || ''} x${action.target?.amount || 1}`;
    case 'place_object': return `Поставить ${action.target?.emoji || ''} ${action.target?.object || ''} (${action.target?.x}, ${action.target?.y})`;
    case 'remove_object': return `Убрать объект (${action.target?.x}, ${action.target?.y})`;
    case 'idle': return 'Бездействие';
    default: return String((action as any).type);
  }
}

export default function AgentDetailModal({ agent, turnHistory, onClose, onGoalChange }: AgentDetailModalProps) {
  const [goalDraft, setGoalDraft] = useState(agent.globalGoal);
  const [activeTab, setActiveTab] = useState<'history' | 'memory' | 'inventory' | 'relationships'>('history');

  const handleGoalSubmit = () => {
    const trimmed = goalDraft.trim();
    if (trimmed && trimmed !== agent.globalGoal) {
      onGoalChange(agent.id, trimmed);
    }
  };

  // Extract this agent's turns from history
  const agentHistory = useMemo(() => {
    return turnHistory
      .filter((record) => record.agentTurns[agent.id])
      .map((record) => ({
        turnId: record.turnId,
        ...record.agentTurns[agent.id],
      }))
      .reverse(); // newest first
  }, [turnHistory, agent.id]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '700px', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', backgroundColor: `${agent.color}22`, border: `2px solid ${agent.color}`, flexShrink: 0 }}>
            {agent.emoji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '1.3rem', lineHeight: 1.2 }}>{agent.name}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{LLM_MODEL_LABELS[agent.model] ?? agent.model}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Позиция: ({agent.position.x}, {agent.position.y}) {!agent.alive && ' — МЁРТВ'}
            </div>
          </div>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '4px 10px', fontSize: '1.1rem', lineHeight: 1 }}>X</button>
        </div>

        {/* Backstory */}
        <div style={{ padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: '8px', borderLeft: `3px solid ${agent.color}` }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Предыстория</div>
          <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>{agent.backstory}</div>
        </div>

        {/* Status bars */}
        <div style={{ display: 'flex', gap: '16px' }}>
          {[
            { label: 'Голод', value: agent.needs.hunger, color: '#ef4444' },
            { label: 'Жажда', value: agent.needs.thirst, color: '#3b82f6' },
            { label: 'Комфорт', value: agent.needs.comfort, color: '#22c55e' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                <span>{label}</span><span>{Math.round(value)}</span>
              </div>
              <div className="status-bar" style={{ height: '10px' }}>
                <div className="status-bar-fill" style={{ width: `${value}%`, backgroundColor: color }} />
              </div>
            </div>
          ))}
        </div>

        {/* Goals */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>Глобальная цель</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input className="input" value={goalDraft} onChange={(e) => setGoalDraft(e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={handleGoalSubmit} style={{ fontSize: '0.8rem' }}>Изменить</button>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>Текущая задача</div>
            <div style={{ fontSize: '0.85rem', padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: '8px' }}>{agent.localGoal || '---'}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
          {[
            { id: 'history' as const, label: `История (${agentHistory.length})` },
            { id: 'memory' as const, label: `Память (${agent.memory.importantEvents.length})` },
            { id: 'inventory' as const, label: `Инвентарь (${agent.inventory.length})` },
            { id: 'relationships' as const, label: `Отношения (${Object.keys(agent.memory.relationships || {}).length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '6px 14px',
                fontSize: '0.8rem',
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id ? `2px solid var(--accent)` : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: '-1px',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: '200px', maxHeight: '350px' }}>
          {/* History tab */}
          {activeTab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {agentHistory.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>Нет истории</div>
              ) : agentHistory.map((turn) => (
                <div key={turn.turnId} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', borderLeft: `3px solid ${agent.color}`, background: 'var(--bg-primary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.8rem', color: agent.color }}>Ход {turn.turnId}</span>
                    {turn.actions && turn.actions.map((a: AgentAction, i: number) => (
                      <span key={i} style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                        {a.type}
                      </span>
                    ))}
                  </div>
                  {turn.thought && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600 }}>Мысль: </span>{turn.thought}
                    </div>
                  )}
                  {turn.actions && turn.actions.length > 0 && (
                    <div style={{ fontSize: '0.78rem', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600 }}>Действия: </span>
                      {turn.actions.map((a: AgentAction, i: number) => (
                        <span key={i}>{formatAction(a)}{i < turn.actions.length - 1 ? '; ' : ''}</span>
                      ))}
                    </div>
                  )}
                  {turn.narrativeEvent && (
                    <div style={{ fontSize: '0.78rem', fontStyle: 'italic', color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: '4px', marginTop: '4px' }}>
                      {turn.narrativeEvent}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Memory tab */}
          {activeTab === 'memory' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {agent.memory.importantEvents.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>Важные события</div>
                  {agent.memory.importantEvents.map((event, idx) => (
                    <div key={idx} className="turn-log-entry important" style={{ borderLeftColor: agent.color }}>
                      <span style={{ color: 'var(--text-secondary)', marginRight: '6px', fontSize: '0.75rem' }}>[Ход {event.turnId}]</span>
                      {event.event}
                    </div>
                  ))}
                </div>
              )}
              {agent.memory.summaries.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>Сводки памяти</div>
                  {agent.memory.summaries.map((summary, idx) => (
                    <div key={idx} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: '6px', lineHeight: 1.4, marginBottom: '6px' }}>
                      {summary}
                    </div>
                  ))}
                </div>
              )}
              {agent.memory.importantEvents.length === 0 && agent.memory.summaries.length === 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>Память пуста</div>
              )}
            </div>
          )}

          {/* Inventory tab */}
          {activeTab === 'inventory' && (
            <div>
              {agent.inventory.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>Инвентарь пуст</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {agent.inventory.map((item: InventoryItem, idx: number) => (
                    <div key={`${item.name}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-primary)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '1.3rem' }}>{item.emoji}</span>
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{item.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>x{item.amount}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Relationships tab */}
          {activeTab === 'relationships' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(() => {
                const rels = agent.memory.relationships || {};
                const relNames = Object.keys(rels);
                if (relNames.length === 0) {
                  return (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
                      Ещё никого не встречал
                    </div>
                  );
                }
                return relNames.map((name) => {
                  const r = rels[name];
                  const attitudeColor = r.attitude.includes('друж') || r.attitude.includes('тёпл') || r.attitude.includes('добр') ? '#22c55e'
                    : r.attitude.includes('вражд') || r.attitude.includes('негат') || r.attitude.includes('опас') ? '#ef4444'
                    : '#eab308';
                  const convo = r.conversationLog || [];
                  return (
                    <div key={name} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', borderLeft: `3px solid ${attitudeColor}`, background: 'var(--bg-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{name}</span>
                        <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', background: `${attitudeColor}22`, color: attitudeColor, fontWeight: 600 }}>
                          {r.attitude}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        {r.description}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px', opacity: 0.7 }}>
                        Последняя встреча: ход {r.lastSeenTurn} | Сообщений: {convo.length}
                      </div>
                      {convo.length > 0 && (
                        <details style={{ marginTop: '6px' }}>
                          <summary style={{ fontSize: '0.72rem', color: 'var(--accent)', cursor: 'pointer', userSelect: 'none' }}>
                            История диалога ({convo.length})
                          </summary>
                          <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '200px', overflowY: 'auto' }}>
                            {convo.map((c, ci) => (
                              <div key={ci} style={{ fontSize: '0.72rem', padding: '3px 6px', borderRadius: '4px', background: c.speaker === agent.name ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.04)' }}>
                                <span style={{ color: 'var(--text-secondary)', marginRight: '4px' }}>[{c.turnId}]</span>
                                <span style={{ fontWeight: 600, color: c.speaker === agent.name ? '#3b82f6' : attitudeColor }}>{c.speaker}:</span>
                                {' '}{c.message}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
