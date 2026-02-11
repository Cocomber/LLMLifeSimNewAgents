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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    if (isPlaying && currentViewTurn >= maxTurn) {
      setIsPlaying(false);
    }
  }, [isPlaying, currentViewTurn, maxTurn]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onViewTurn(Number(e.target.value));
  };

  const goFirst = () => { setIsPlaying(false); onViewTurn(0); };
  const goPrev = () => { if (currentViewTurn > 0) onViewTurn(currentViewTurn - 1); };
  const goNext = () => { if (currentViewTurn < maxTurn) onViewTurn(currentViewTurn + 1); };
  const goLast = () => { setIsPlaying(false); onViewTurn(maxTurn); };
  const toggleAutoPlay = () => { setIsPlaying((prev) => !prev); };

  const currentRecord = turnHistory.find((r) => r.turnId === currentViewTurn);

  const btnStyle: React.CSSProperties = { padding: '3px 7px', fontSize: '0.8rem', minWidth: '32px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header: turn nav */}
      <div style={{ flexShrink: 0, padding: '10px 10px 6px', borderBottom: '1px solid var(--border)' }}>
        {/* Turn counter */}
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
          История ходов
        </div>

        <div style={{ fontWeight: 600, fontSize: '0.85rem', textAlign: 'center', marginBottom: '6px' }}>
          Ход {currentViewTurn} / {maxTurn}
        </div>

        {/* Slider */}
        <input
          type="range"
          min={0}
          max={maxTurn}
          value={currentViewTurn}
          onChange={handleSliderChange}
          style={{ width: '100%', cursor: 'pointer', marginBottom: '6px' }}
        />

        {/* Nav buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={goFirst} disabled={currentViewTurn === 0} style={btnStyle} title="Первый ход">⏮</button>
          <button className="btn btn-secondary" onClick={goPrev} disabled={currentViewTurn === 0} style={btnStyle} title="Предыдущий">◀</button>
          <button className="btn btn-secondary" onClick={goNext} disabled={currentViewTurn >= maxTurn} style={btnStyle} title="Следующий">▶</button>
          <button className="btn btn-secondary" onClick={goLast} disabled={currentViewTurn >= maxTurn} style={btnStyle} title="Последний">⏭</button>
          <button
            className={isPlaying ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={toggleAutoPlay}
            disabled={maxTurn === 0}
            style={{ ...btnStyle, fontSize: '0.75rem', whiteSpace: 'nowrap' }}
          >
            {isPlaying ? '⏸' : '▶ Авто'}
          </button>
        </div>
      </div>

      {/* Detail section - scrollable, fills remaining space */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', fontSize: '0.76rem' }}>
        {currentViewTurn > 0 && currentRecord ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Agent sections */}
            {Object.entries(currentRecord.agentTurns).map(([agentId, turn]) => {
              const agentInfo = agentLookup.get(agentId);
              return (
                <div
                  key={agentId}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.04))',
                    border: '1px solid var(--border)',
                    borderLeft: `3px solid ${agentInfo?.color || 'var(--border)'}`,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '3px', color: agentInfo?.color || 'var(--text-primary)', fontSize: '0.8rem' }}>
                    {agentInfo?.emoji || '?'} {agentInfo?.name || agentId}
                  </div>

                  {turn.thought && (
                    <div style={{ marginBottom: '2px', color: 'var(--text-secondary)' }}>
                      <span style={{ fontWeight: 600 }}>Мысль: </span>{turn.thought}
                    </div>
                  )}

                  {turn.localGoal && (
                    <div style={{ marginBottom: '2px', color: 'var(--text-secondary)' }}>
                      <span style={{ fontWeight: 600 }}>Задача: </span>{turn.localGoal}
                    </div>
                  )}

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
              <div style={{ padding: '6px 8px', borderRadius: '6px', backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.04))', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, marginBottom: '3px' }}>Мировые события</div>
                {currentRecord.worldEvents.map((evt, i) => (
                  <div key={i} style={{ color: 'var(--text-secondary)' }}>{evt}</div>
                ))}
              </div>
            )}

            {/* Messages */}
            {currentRecord.messages.length > 0 && (
              <div style={{ padding: '6px 8px', borderRadius: '6px', backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.04))', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, marginBottom: '3px' }}>Сообщения</div>
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
          </div>
        ) : (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', paddingTop: '20px' }}>
            {currentViewTurn === 0
              ? 'Выберите ход для просмотра деталей.'
              : 'Нет данных для этого хода.'}
          </div>
        )}
      </div>
    </div>
  );
}
