'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { TurnRecord, AgentAction, AgentState } from '@/types';

interface PlaybackControlsProps {
  turnHistory: TurnRecord[];
  currentViewTurn: number;
  onViewTurn: (turnId: number) => void;
  maxTurn: number;
  agents: AgentState[];
}

function formatAction(action: AgentAction): string {
  switch (action.type) {
    case 'move':
      return `Движение (${action.target[0]}, ${action.target[1]})`;
    case 'go_to':
      return `Идти к (${action.target[0]}, ${action.target[1]})`;
    case 'search':
      return `Поиск (${action.target[0]}, ${action.target[1]})`;
    case 'add_inventory':
      return `Взять ${action.target.emoji} ${action.target.item} x${action.target.amount}`;
    case 'remove_inventory':
      return `Использовать ${action.target.emoji} ${action.target.item} x${action.target.amount}`;
    case 'place_object':
      return `Поставить ${action.target.emoji} ${action.target.object} (${action.target.x}, ${action.target.y})`;
    case 'remove_object':
      return `Убрать объект (${action.target.x}, ${action.target.y})`;
    case 'idle':
      return 'Бездействие';
    default:
      return String((action as AgentAction).type);
  }
}

export default function PlaybackControls({
  turnHistory,
  currentViewTurn,
  onViewTurn,
  maxTurn,
  agents,
}: PlaybackControlsProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build lookup map from agent ID to agent object
  const agentLookup = React.useMemo(() => {
    const map = new Map<string, AgentState>();
    for (const agent of agents) {
      map.set(agent.id, agent);
    }
    return map;
  }, [agents]);

  const advanceTurn = useCallback(() => {
    onViewTurn(currentViewTurn < maxTurn ? currentViewTurn + 1 : 0);
  }, [currentViewTurn, maxTurn, onViewTurn]);

  // Auto-play interval
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        advanceTurn();
      }, 1500);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, advanceTurn]);

  // Stop auto-play if we reach the last turn
  useEffect(() => {
    if (isPlaying && currentViewTurn >= maxTurn) {
      setIsPlaying(false);
    }
  }, [isPlaying, currentViewTurn, maxTurn]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    onViewTurn(value);
  };

  const goFirst = () => {
    setIsPlaying(false);
    onViewTurn(0);
  };

  const goPrev = () => {
    if (currentViewTurn > 0) {
      onViewTurn(currentViewTurn - 1);
    }
  };

  const goNext = () => {
    if (currentViewTurn < maxTurn) {
      onViewTurn(currentViewTurn + 1);
    }
  };

  const goLast = () => {
    setIsPlaying(false);
    onViewTurn(maxTurn);
  };

  const toggleAutoPlay = () => {
    setIsPlaying((prev) => !prev);
  };

  const currentRecord = turnHistory.find((r) => r.turnId === currentViewTurn);

  return (
    <div
      className="panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '10px 16px',
      }}
    >
      {/* Slider row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          Ход 0
        </span>
        <input
          type="range"
          min={0}
          max={maxTurn}
          value={currentViewTurn}
          onChange={handleSliderChange}
          style={{ flex: 1, cursor: 'pointer' }}
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          Ход {maxTurn}
        </span>
      </div>

      {/* Navigation row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          flexWrap: 'wrap',
        }}
      >
        <button
          className="btn btn-secondary"
          onClick={goFirst}
          disabled={currentViewTurn === 0}
          style={{ padding: '4px 8px', fontSize: '0.85rem' }}
          title="Первый ход"
        >
          ⏮
        </button>
        <button
          className="btn btn-secondary"
          onClick={goPrev}
          disabled={currentViewTurn === 0}
          style={{ padding: '4px 8px', fontSize: '0.85rem' }}
          title="Предыдущий ход"
        >
          ◀
        </button>

        <span
          style={{
            fontSize: '0.82rem',
            fontWeight: 600,
            padding: '0 8px',
            whiteSpace: 'nowrap',
          }}
        >
          Просмотр хода: {currentViewTurn} / {maxTurn}
        </span>

        <button
          className="btn btn-secondary"
          onClick={goNext}
          disabled={currentViewTurn >= maxTurn}
          style={{ padding: '4px 8px', fontSize: '0.85rem' }}
          title="Следующий ход"
        >
          ▶
        </button>
        <button
          className="btn btn-secondary"
          onClick={goLast}
          disabled={currentViewTurn >= maxTurn}
          style={{ padding: '4px 8px', fontSize: '0.85rem' }}
          title="Последний ход"
        >
          ⏭
        </button>

        {/* Separator */}
        <div
          style={{
            width: '1px',
            height: '24px',
            backgroundColor: 'var(--border)',
            flexShrink: 0,
            margin: '0 4px',
          }}
        />

        {/* Auto-play button */}
        <button
          className={isPlaying ? 'btn btn-primary' : 'btn btn-secondary'}
          onClick={toggleAutoPlay}
          disabled={maxTurn === 0}
          style={{ padding: '4px 10px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
        >
          {isPlaying ? '⏸ Стоп' : '▶ Авто'}
        </button>

        {/* Separator */}
        <div
          style={{
            width: '1px',
            height: '24px',
            backgroundColor: 'var(--border)',
            flexShrink: 0,
            margin: '0 4px',
          }}
        />

        {/* Toggle detail panel */}
        <button
          className="btn btn-secondary"
          onClick={() => setDetailOpen((prev) => !prev)}
          style={{ padding: '4px 10px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
        >
          {detailOpen ? 'Скрыть детали' : 'Детали хода'}
        </button>
      </div>

      {/* Turn detail panel (collapsible) */}
      {detailOpen && currentViewTurn > 0 && currentRecord && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: '8px',
            marginTop: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '260px',
            overflowY: 'auto',
            fontSize: '0.78rem',
          }}
        >
          {/* Agent actions */}
          {Object.entries(currentRecord.agentTurns).map(([agentId, turn]) => {
            const agentInfo = agentLookup.get(agentId);
            return (
            <div
              key={agentId}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.04))',
                border: '1px solid var(--border)',
                borderLeft: `4px solid ${agentInfo?.color || 'var(--border)'}`,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '4px', color: agentInfo?.color || 'var(--text-primary)' }}>
                {agentInfo?.emoji || '?'} {agentInfo?.name || agentId}
              </div>

              {/* Thought */}
              {turn.thought && (
                <div style={{ marginBottom: '2px', color: 'var(--text-secondary)' }}>
                  <span style={{ fontWeight: 600 }}>Мысль: </span>
                  {turn.thought}
                </div>
              )}

              {/* Goals */}
              {turn.localGoal && (
                <div style={{ marginBottom: '2px', color: 'var(--text-secondary)' }}>
                  <span style={{ fontWeight: 600 }}>Задача: </span>
                  {turn.localGoal}
                </div>
              )}

              {/* Actions */}
              {turn.actions.length > 0 && (
                <div style={{ marginBottom: '2px' }}>
                  <span style={{ fontWeight: 600 }}>Действия: </span>
                  {turn.actions.map((a, i) => (
                    <span key={i}>
                      {formatAction(a)}
                      {i < turn.actions.length - 1 ? '; ' : ''}
                    </span>
                  ))}
                </div>
              )}

              {/* Narrative event */}
              {turn.narrativeEvent && (
                <div style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                  {turn.narrativeEvent}
                </div>
              )}
            </div>
            );
          })}

          {/* World events */}
          {currentRecord.worldEvents.length > 0 && (
            <div
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.04))',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                Мировые события
              </div>
              {currentRecord.worldEvents.map((evt, i) => (
                <div key={i} style={{ color: 'var(--text-secondary)' }}>
                  {evt}
                </div>
              ))}
            </div>
          )}

          {/* Messages */}
          {currentRecord.messages.length > 0 && (
            <div
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.04))',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                Сообщения
              </div>
              {currentRecord.messages.map((msg, i) => (
                <div key={i} style={{ marginBottom: '2px' }}>
                  <span style={{ fontWeight: 600 }}>{msg.fromAgentName}</span>
                  {msg.toAgentId ? (
                    <span style={{ color: 'var(--text-secondary)' }}> (к {msg.toAgentId})</span>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)' }}> (всем)</span>
                  )}
                  : {msg.message}
                </div>
              ))}
            </div>
          )}

          {/* Empty state for detail panel when no data */}
        </div>
      )}

      {detailOpen && (currentViewTurn === 0 || !currentRecord) && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: '8px',
            marginTop: '4px',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            textAlign: 'center',
          }}
        >
          {currentViewTurn === 0
            ? 'Выберите ход для просмотра деталей.'
            : 'Нет данных для этого хода.'}
        </div>
      )}
    </div>
  );
}
