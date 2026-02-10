'use client';

import React, { useState } from 'react';
import type { AgentState, InventoryItem } from '@/types';
import { LLM_MODEL_LABELS } from '@/types';

interface AgentDetailModalProps {
  agent: AgentState;
  onClose: () => void;
  onGoalChange: (agentId: string, newGoal: string) => void;
}

export default function AgentDetailModal({
  agent,
  onClose,
  onGoalChange,
}: AgentDetailModalProps) {
  const [goalDraft, setGoalDraft] = useState(agent.globalGoal);

  const handleGoalSubmit = () => {
    const trimmed = goalDraft.trim();
    if (trimmed && trimmed !== agent.globalGoal) {
      onGoalChange(agent.id, trimmed);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}
      >
        {/* ===== Header ===== */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '2.2rem' }}>{agent.emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '1.25rem', lineHeight: 1.2 }}>
              {agent.name}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {LLM_MODEL_LABELS[agent.model] ?? agent.model}
            </div>
          </div>
          <button
            className="btn btn-secondary"
            onClick={onClose}
            style={{ padding: '4px 10px', fontSize: '1.1rem', lineHeight: 1 }}
          >
            X
          </button>
        </div>

        {/* ===== Backstory ===== */}
        {agent.backstory && (
          <div>
            <div className="panel-header">Предыстория</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {agent.backstory}
            </div>
          </div>
        )}

        {/* ===== Status bars ===== */}
        <div>
          <div className="panel-header">Состояние</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Hunger */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', width: '70px', flexShrink: 0 }}>
                Голод
              </span>
              <div className="status-bar" style={{ flex: 1, height: '12px' }}>
                <div
                  className="status-bar-fill"
                  style={{
                    width: `${agent.needs.hunger}%`,
                    backgroundColor: '#ef4444',
                  }}
                />
              </div>
              <span style={{ fontSize: '0.8rem', width: '32px', textAlign: 'right', flexShrink: 0 }}>
                {Math.round(agent.needs.hunger)}
              </span>
            </div>

            {/* Thirst */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', width: '70px', flexShrink: 0 }}>
                Жажда
              </span>
              <div className="status-bar" style={{ flex: 1, height: '12px' }}>
                <div
                  className="status-bar-fill"
                  style={{
                    width: `${agent.needs.thirst}%`,
                    backgroundColor: '#3b82f6',
                  }}
                />
              </div>
              <span style={{ fontSize: '0.8rem', width: '32px', textAlign: 'right', flexShrink: 0 }}>
                {Math.round(agent.needs.thirst)}
              </span>
            </div>

            {/* Comfort */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', width: '70px', flexShrink: 0 }}>
                Комфорт
              </span>
              <div className="status-bar" style={{ flex: 1, height: '12px' }}>
                <div
                  className="status-bar-fill"
                  style={{
                    width: `${agent.needs.comfort}%`,
                    backgroundColor: '#22c55e',
                  }}
                />
              </div>
              <span style={{ fontSize: '0.8rem', width: '32px', textAlign: 'right', flexShrink: 0 }}>
                {Math.round(agent.needs.comfort)}
              </span>
            </div>
          </div>
        </div>

        {/* ===== Goals ===== */}
        <div>
          <div className="panel-header">Цели</div>

          {/* Global goal with edit */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Глобальная цель
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                className="input"
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" onClick={handleGoalSubmit}>
                Изменить
              </button>
            </div>
          </div>

          {/* Local goal read-only */}
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Текущая задача
            </div>
            <div style={{ fontSize: '0.85rem', lineHeight: 1.4 }}>
              {agent.localGoal || '---'}
            </div>
          </div>
        </div>

        {/* ===== Inventory ===== */}
        <div>
          <div className="panel-header">Инвентарь</div>
          {agent.inventory.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Пусто</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {agent.inventory.map((item: InventoryItem, idx: number) => (
                <div key={`${item.name}-${idx}`} className="inventory-item">
                  <span>{item.emoji}</span>
                  <span>{item.name}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>x{item.amount}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== Memory - Important Events ===== */}
        <div>
          <div className="panel-header">Память — Важные события</div>
          {agent.memory.importantEvents.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Нет событий</div>
          ) : (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {agent.memory.importantEvents.map((event, idx) => (
                <div
                  key={`evt-${idx}`}
                  className={`turn-log-entry${event.important ? ' important' : ''}`}
                >
                  <span style={{ color: 'var(--text-secondary)', marginRight: '6px' }}>
                    [{event.turnId}]
                  </span>
                  {event.event}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== Memory - Summaries ===== */}
        <div>
          <div className="panel-header">Память — Сводки</div>
          {agent.memory.summaries.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Нет сводок</div>
          ) : (
            <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {agent.memory.summaries.map((summary, idx) => (
                <div
                  key={`sum-${idx}`}
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    padding: '6px 10px',
                    background: 'var(--bg-primary)',
                    borderRadius: '6px',
                    lineHeight: 1.4,
                  }}
                >
                  {summary}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== Recent Actions ===== */}
        <div>
          <div className="panel-header">Последние действия</div>
          {agent.memory.recentTurns.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Нет действий</div>
          ) : (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {agent.memory.recentTurns.slice(-8).map((turn, idx) => (
                <div key={`turn-${idx}`} className="turn-log-entry">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--accent)' }}>
                      Ход {turn.turnId}
                    </span>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {turn.action.type}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', lineHeight: 1.4 }}>
                    {turn.narrativeEvent}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
