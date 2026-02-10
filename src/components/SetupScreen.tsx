'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  LLMModel,
  LLM_MODEL_LABELS,
  AGENT_EMOJIS,
  AGENT_COLORS,
  AgentConfig,
  ApiKeys,
  CommunicationMode,
  SaveMeta,
} from '@/types';

interface SetupScreenProps {
  onGameCreated: (game: any, apiKeys: ApiKeys) => void;
}

const COMMUNICATION_LABELS: Record<CommunicationMode, string> = {
  speech: 'Речь (полноценная)',
  signals: 'Сигналы (короткие)',
  custom_language: 'Свой язык',
  none: 'Без общения',
};

const ALL_MODELS = Object.keys(LLM_MODEL_LABELS) as LLMModel[];

function makeDefaultAgent(index: number): AgentConfig {
  return {
    id: uuidv4(),
    model: 'gpt-4o-mini',
    globalGoal: 'Выжить',
    emoji: AGENT_EMOJIS[index] ?? '🟦',
    color: AGENT_COLORS[index] ?? '#3B82F6',
  };
}

export default function SetupScreen({ onGameCreated }: SetupScreenProps) {
  // ---- API Keys ----
  const [apiKeys, setApiKeys] = useState<ApiKeys>({
    openai: '',
    deepseek: '',
    gemini: '',
    anthropic: '',
  });
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({
    openai: false,
    deepseek: false,
    gemini: false,
    anthropic: false,
  });

  // ---- Agent configs ----
  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>([
    makeDefaultAgent(0),
    makeDefaultAgent(1),
  ]);

  // ---- Settings ----
  const [communicationMode, setCommunicationMode] = useState<CommunicationMode>('speech');
  const [visibilityRange, setVisibilityRange] = useState(2);

  // ---- UI state ----
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [loadingSave, setLoadingSave] = useState<string | null>(null);

  // ---- Fetch saves on mount ----
  useEffect(() => {
    async function fetchSaves() {
      try {
        const res = await fetch('/api/game/load');
        const data = await res.json();
        if (data.success && Array.isArray(data.saves)) {
          setSaves(data.saves);
        }
      } catch {
        // silently ignore — saves are optional
      }
    }
    fetchSaves();
  }, []);

  // ---- Agent count helpers ----
  const agentCount = agentConfigs.length;

  const setAgentCount = useCallback(
    (count: number) => {
      const clamped = Math.max(0, Math.min(4, count));
      setAgentConfigs((prev) => {
        if (clamped > prev.length) {
          const added = Array.from({ length: clamped - prev.length }, (_, i) =>
            makeDefaultAgent(prev.length + i),
          );
          return [...prev, ...added];
        }
        return prev.slice(0, clamped);
      });
    },
    [],
  );

  const updateAgent = useCallback(
    (index: number, patch: Partial<AgentConfig>) => {
      setAgentConfigs((prev) =>
        prev.map((a, i) => (i === index ? { ...a, ...patch } : a)),
      );
    },
    [],
  );

  // ---- Key helpers ----
  const updateKey = (provider: keyof ApiKeys, value: string) => {
    setApiKeys((prev) => ({ ...prev, [provider]: value }));
  };

  const toggleShowKey = (provider: string) => {
    setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  // ---- Start game ----
  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/game/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentConfigs,
          apiKeys,
          settings: {
            communicationMode,
            visibilityRange,
            needsDecayRate: { hunger: 0.5, thirst: 1, comfort: 0 },
          },
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Не удалось создать игру');
      }
      onGameCreated(data.game, apiKeys);
    } catch (err: any) {
      setError(err.message ?? 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  };

  // ---- Load game ----
  const handleLoad = async (save: SaveMeta) => {
    setLoadingSave(save.id);
    setError(null);
    try {
      const res = await fetch('/api/game/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: save.id, apiKeys }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Не удалось загрузить сохранение');
      }
      onGameCreated(data.game, apiKeys);
    } catch (err: any) {
      setError(err.message ?? 'Неизвестная ошибка');
    } finally {
      setLoadingSave(null);
    }
  };

  // ---- File upload ----
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const saveFile = JSON.parse(text);
        // Support both SaveFile format (with gameState wrapper) and direct GameState
        const game = saveFile.gameState || saveFile;
        if (!game.id || !game.world || !game.agents) {
          throw new Error('Неверный формат файла сохранения');
        }
        // Apply current API keys
        game.apiKeys = apiKeys;
        onGameCreated(game, apiKeys);
      } catch (err: any) {
        setError(err.message ?? 'Ошибка чтения файла');
      }
    };
    reader.onerror = () => setError('Ошибка чтения файла');
    reader.readAsText(file);

    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [apiKeys, onGameCreated]);

  // ---- Render ----
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        padding: '40px 16px 80px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* ====== Header ====== */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <h1
            style={{
              fontSize: '2.25rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: 8,
            }}
          >
            AI Life Simulator
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: 560, margin: '0 auto' }}>
            Настройте агентов с искусственным интеллектом и наблюдайте, как они
            выживают, взаимодействуют и развиваются в процедурно-генерируемом мире.
          </p>
        </div>

        {/* ====== API Keys ====== */}
        <section className="panel">
          <div className="panel-header">API-ключи</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: 12 }}>
            Укажите ключи для тех провайдеров, моделями которых хотите пользоваться.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {(
              [
                { key: 'openai' as const, label: 'OpenAI' },
                { key: 'deepseek' as const, label: 'DeepSeek' },
                { key: 'gemini' as const, label: 'Google Gemini' },
                { key: 'anthropic' as const, label: 'Anthropic' },
              ] as const
            ).map(({ key, label }) => (
              <div key={key}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    marginBottom: 4,
                  }}
                >
                  {label}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showKeys[key] ? 'text' : 'password'}
                    placeholder={`${label} API Key`}
                    value={apiKeys[key] ?? ''}
                    onChange={(e) => updateKey(key, e.target.value)}
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey(key)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      padding: '2px 4px',
                    }}
                  >
                    {showKeys[key] ? 'Скрыть' : 'Показать'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ====== Agent Configuration ====== */}
        <section className="panel">
          <div className="panel-header">Конфигурация агентов</div>

          {/* Agent count selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              Количество агентов:
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {[0, 1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={n === agentCount ? 'btn btn-primary' : 'btn btn-secondary'}
                  onClick={() => setAgentCount(n)}
                  style={{ minWidth: 36 }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Agent cards */}
          {agentCount === 0 && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontStyle: 'italic' }}>
              Агенты не добавлены. Мир будет пустым.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {agentConfigs.map((agent, idx) => (
              <div
                key={agent.id}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: `1px solid ${agent.color}44`,
                  backgroundColor: `${agent.color}08`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Emoji + color indicator */}
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.5rem',
                      backgroundColor: `${agent.color}22`,
                      border: `2px solid ${agent.color}`,
                      flexShrink: 0,
                    }}
                  >
                    {agent.emoji}
                  </div>

                  {/* Model selector */}
                  <div style={{ flex: '0 0 220px' }}>
                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
                      Модель
                    </label>
                    <select
                      className="select"
                      value={agent.model}
                      onChange={(e) => updateAgent(idx, { model: e.target.value as LLMModel })}
                      style={{ width: '100%' }}
                    >
                      {ALL_MODELS.map((m) => (
                        <option key={m} value={m}>
                          {LLM_MODEL_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Global goal */}
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
                      Глобальная цель
                    </label>
                    <input
                      className="input"
                      type="text"
                      value={agent.globalGoal}
                      onChange={(e) => updateAgent(idx, { globalGoal: e.target.value })}
                      placeholder="Выжить"
                    />
                  </div>
                </div>

                {/* Optional custom fields (collapsible) */}
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                    Задать имя, возраст и историю (опционально)
                  </summary>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8, marginTop: 8 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
                        Имя персонажа
                      </label>
                      <input
                        className="input"
                        type="text"
                        value={agent.customName || ''}
                        onChange={(e) => updateAgent(idx, { customName: e.target.value })}
                        placeholder="Оставьте пустым для авто-генерации"
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
                        Возраст
                      </label>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={999}
                        value={agent.customAge || ''}
                        onChange={(e) => updateAgent(idx, { customAge: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="—"
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
                      Предыстория
                    </label>
                    <textarea
                      className="input"
                      value={agent.customBackstory || ''}
                      onChange={(e) => updateAgent(idx, { customBackstory: e.target.value })}
                      placeholder="Оставьте пустым для авто-генерации"
                      rows={2}
                      style={{ resize: 'vertical', width: '100%' }}
                    />
                  </div>
                </details>
              </div>
            ))}
          </div>
        </section>

        {/* ====== Game Settings ====== */}
        <section className="panel">
          <div className="panel-header">Настройки игры</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Communication mode */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  marginBottom: 6,
                }}
              >
                Режим общения
              </label>
              <select
                className="select"
                value={communicationMode}
                onChange={(e) => setCommunicationMode(e.target.value as CommunicationMode)}
                style={{ width: '100%' }}
              >
                {(Object.keys(COMMUNICATION_LABELS) as CommunicationMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {COMMUNICATION_LABELS[mode]}
                  </option>
                ))}
              </select>
            </div>

            {/* Visibility range */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  marginBottom: 6,
                }}
              >
                Дальность видимости: <strong style={{ color: 'var(--text-primary)' }}>{visibilityRange}</strong>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={visibilityRange}
                onChange={(e) => setVisibilityRange(Number(e.target.value))}
                style={{ width: '100%', marginTop: 4 }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.7rem',
                  color: 'var(--text-secondary)',
                  marginTop: 2,
                }}
              >
                <span>1</span>
                <span>5</span>
              </div>
            </div>
          </div>
        </section>

        {/* ====== Load Game ====== */}
        <section className="panel">
          <div className="panel-header">Загрузить сохранение</div>

          {/* Server saves */}
          {saves.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {saves.map((save) => {
                const dateStr = new Date(save.savedAt).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const isLoading = loadingSave === save.id;
                return (
                  <button
                    key={save.id}
                    type="button"
                    onClick={() => handleLoad(save)}
                    disabled={isLoading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      cursor: isLoading ? 'wait' : 'pointer',
                      opacity: isLoading ? 0.6 : 1,
                      textAlign: 'left',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-tertiary)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-primary)';
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>
                        {save.name || save.id}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        Ход {save.turn} &middot; {save.agentCount} агент(ов) &middot; {dateStr}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>
                      {isLoading ? 'Загрузка...' : 'Загрузить'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* File upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%',
              padding: '12px 0',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>📂</span>
            Загрузить из файла (.json)
          </button>
        </section>

        {/* ====== Error ====== */}
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              backgroundColor: 'rgba(239,68,68,0.12)',
              border: '1px solid var(--danger)',
              color: '#fca5a5',
              fontSize: '0.85rem',
            }}
          >
            {error}
          </div>
        )}

        {/* ====== Start Button ====== */}
        <button
          type="button"
          className="btn btn-primary"
          disabled={loading}
          onClick={handleStart}
          style={{
            width: '100%',
            padding: '14px 0',
            fontSize: '1rem',
            fontWeight: 600,
            letterSpacing: '0.02em',
            position: 'relative',
          }}
        >
          {loading ? (
            <span className="loading-pulse">Создание мира...</span>
          ) : (
            'Начать симуляцию'
          )}
        </button>
      </div>
    </div>
  );
}
