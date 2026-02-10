'use client';

import React, { useState, useMemo } from 'react';
import type { AgentState, LLMModel, ApiKeys } from '@/types';
import { LLM_MODEL_LABELS, getProviderForModel } from '@/types';

interface AgentSettingsModalProps {
  agents: AgentState[];
  apiKeys: ApiKeys;
  onClose: () => void;
  onAgentAction: (agentId: string, action: string, params?: Record<string, any>) => Promise<void>;
}

export default function AgentSettingsModal({
  agents,
  apiKeys,
  onClose,
  onAgentAction,
}: AgentSettingsModalProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Available models based on API keys
  const availableModels = useMemo(() => {
    const models: { value: LLMModel; label: string }[] = [];
    const allModels = Object.keys(LLM_MODEL_LABELS) as LLMModel[];
    for (const model of allModels) {
      const provider = getProviderForModel(model);
      if (apiKeys[provider]) {
        models.push({ value: model, label: LLM_MODEL_LABELS[model] });
      }
    }
    return models;
  }, [apiKeys]);

  const handleAction = async (agentId: string, action: string, params?: Record<string, any>) => {
    setLoadingAction(`${agentId}-${action}`);
    try {
      await onAgentAction(agentId, action, params);
    } finally {
      setLoadingAction(null);
    }
  };

  const getStatusBadge = (agent: AgentState) => {
    if (!agent.alive) {
      return <span style={{ color: '#6b7280', fontSize: '0.75rem', fontWeight: 600 }}>МЁРТВ</span>;
    }
    if (agent.paused) {
      return <span style={{ color: '#eab308', fontSize: '0.75rem', fontWeight: 600 }}>ПАУЗА</span>;
    }
    if (agent.errorCount && agent.errorCount > 0) {
      return (
        <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 600 }}>
          ОШИБКА ({agent.errorCount}x)
        </span>
      );
    }
    return <span style={{ color: '#22c55e', fontSize: '0.75rem', fontWeight: 600 }}>OK</span>;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxWidth: '750px',
          maxHeight: '85vh',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
            Управление агентами
          </h2>
          <button
            className="btn btn-secondary"
            onClick={onClose}
            style={{ padding: '4px 10px', fontSize: '1.1rem', lineHeight: 1 }}
          >
            X
          </button>
        </div>

        {/* Agent List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {agents.map((agent) => (
            <div
              key={agent.id}
              style={{
                padding: '14px 16px',
                borderRadius: '10px',
                background: 'var(--bg-primary)',
                border: `1px solid ${agent.errorCount && agent.errorCount > 0 ? '#ef4444' : agent.paused ? '#eab308' : 'var(--border)'}`,
                opacity: agent.alive ? 1 : 0.5,
              }}
            >
              {/* Agent header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ fontSize: '1.3rem' }}>{agent.emoji}</span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: agent.color }}>
                  {agent.name}
                </span>
                {getStatusBadge(agent)}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                  {LLM_MODEL_LABELS[agent.model] || agent.model}
                </span>
              </div>

              {/* Error message */}
              {agent.lastError && (agent.errorCount || 0) > 0 && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    backgroundColor: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: '#fca5a5',
                    fontSize: '0.8rem',
                    marginBottom: '10px',
                    wordBreak: 'break-word',
                  }}
                >
                  <strong>Ошибка (ход {agent.lastErrorTurn}):</strong>{' '}
                  {agent.lastError.length > 200 ? agent.lastError.slice(0, 200) + '...' : agent.lastError}
                </div>
              )}

              {/* Controls row */}
              {agent.alive && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {/* Model selector */}
                  <select
                    className="input"
                    value={agent.model}
                    onChange={(e) =>
                      handleAction(agent.id, 'change_model', { model: e.target.value })
                    }
                    disabled={loadingAction !== null}
                    style={{ minWidth: '160px', padding: '5px 8px', fontSize: '0.8rem' }}
                  >
                    {availableModels.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>

                  {/* Pause/Resume */}
                  <button
                    className={agent.paused ? 'btn btn-primary' : 'btn btn-secondary'}
                    onClick={() =>
                      handleAction(agent.id, 'toggle_pause', { paused: !agent.paused })
                    }
                    disabled={loadingAction !== null}
                    style={{ fontSize: '0.8rem', padding: '5px 12px', whiteSpace: 'nowrap' }}
                  >
                    {agent.paused ? 'Возобновить' : 'Пауза'}
                  </button>

                  {/* Reset errors */}
                  {(agent.errorCount || 0) > 0 && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleAction(agent.id, 'reset_errors')}
                      disabled={loadingAction !== null}
                      style={{
                        fontSize: '0.8rem',
                        padding: '5px 12px',
                        whiteSpace: 'nowrap',
                        color: '#fca5a5',
                        borderColor: 'rgba(239,68,68,0.4)',
                      }}
                    >
                      Сбросить ошибки
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer legend */}
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <strong>Подсказки:</strong> Смена модели сбрасывает счётчик ошибок. При ошибках LLM система автоматически
          повторяет запрос до 3 раз с нарастающей задержкой (2с, 4с, 8с).
          Приостановленные агенты пропускают ходы, но остаются в мире.
        </div>
      </div>
    </div>
  );
}
