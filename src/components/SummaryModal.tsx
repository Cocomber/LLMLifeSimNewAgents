'use client';

import React, { useState, useMemo } from 'react';
import type { TurnRecord, AgentState, LLMModel, ApiKeys } from '@/types';
import { LLM_MODEL_LABELS, getProviderForModel } from '@/types';

interface SummaryModalProps {
  turnHistory: TurnRecord[];
  agents: AgentState[];
  maxTurn: number;
  apiKeys: Record<string, string | undefined>;
  onClose: () => void;
}

export default function SummaryModal({ turnHistory, agents, maxTurn, apiKeys, onClose }: SummaryModalProps) {
  const [turnCount, setTurnCount] = useState(Math.min(10, maxTurn));
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build list of available models based on which API keys are provided
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

  const [selectedModel, setSelectedModel] = useState<LLMModel>(
    availableModels.length > 0 ? availableModels[0].value : 'gpt-4o-mini'
  );

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setSummary(null);

    try {
      const res = await fetch('/api/game/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnCount,
          turnHistory,
          agents,
          apiKeys,
          model: selectedModel,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Ошибка генерации саммари');
      }
      setSummary(data.summary);
    } catch (err: any) {
      setError(err.message ?? 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '700px', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Саммари событий</h2>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '4px 10px', fontSize: '1.1rem', lineHeight: 1 }}>X</button>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            Ходов:
          </label>
          <input
            className="input"
            type="number"
            min={1}
            max={maxTurn}
            value={turnCount}
            onChange={(e) => setTurnCount(Math.max(1, Math.min(maxTurn, Number(e.target.value))))}
            style={{ width: '70px', textAlign: 'center' }}
            disabled={loading}
          />
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            Модель:
          </label>
          <select
            className="input"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as LLMModel)}
            disabled={loading || availableModels.length === 0}
            style={{ minWidth: '160px', padding: '6px 8px' }}
          >
            {availableModels.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={loading || maxTurn === 0 || availableModels.length === 0}
            style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
          >
            {loading ? <span className="loading-pulse">Генерация...</span> : 'Сгенерировать'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 8,
            backgroundColor: 'rgba(239,68,68,0.12)',
            border: '1px solid var(--danger)',
            color: '#fca5a5',
            fontSize: '0.85rem',
          }}>
            {error}
          </div>
        )}

        {/* Summary result */}
        {summary && (
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            background: 'var(--bg-primary)',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            fontSize: '0.9rem',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            maxHeight: '400px',
          }}>
            {summary}
          </div>
        )}

        {!summary && !loading && !error && (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px',
            color: 'var(--text-secondary)',
            fontSize: '0.85rem',
          }}>
            Выберите количество ходов и модель, затем нажмите «Сгенерировать»
          </div>
        )}
      </div>
    </div>
  );
}
