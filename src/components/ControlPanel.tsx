'use client';

import React, { useState } from 'react';

interface ControlPanelProps {
  currentTurn: number;
  isGenerating: boolean;
  onGenerateTurns: (count: number) => void;
  onSave: () => void;
  onOpenWorldEditor: () => void;
  onSendMessage: (message: string) => void;
  onBackToSetup: () => void;
  onOpenSummary: () => void;
}

export default function ControlPanel({
  currentTurn,
  isGenerating,
  onGenerateTurns,
  onSave,
  onOpenWorldEditor,
  onSendMessage,
  onBackToSetup,
  onOpenSummary,
}: ControlPanelProps) {
  const [customTurnCount, setCustomTurnCount] = useState(5);
  const [godMessage, setGodMessage] = useState('');

  const handleCustomGenerate = () => {
    if (customTurnCount >= 1 && customTurnCount <= 100) {
      onGenerateTurns(customTurnCount);
    }
  };

  const handleSendMessage = () => {
    const trimmed = godMessage.trim();
    if (trimmed) {
      onSendMessage(trimmed);
      setGodMessage('');
    }
  };

  const handleMessageKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCustomGenerate();
    }
  };

  return (
    <div
      className="panel"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
      }}
    >
      {/* ===== Turn Info ===== */}
      <div
        style={{
          fontWeight: 600,
          fontSize: '0.9rem',
          whiteSpace: 'nowrap',
          paddingRight: '4px',
          borderRight: '1px solid var(--border)',
          marginRight: '4px',
        }}
      >
        Ход: {currentTurn}
      </div>

      {/* ===== Next Turn Button ===== */}
      <button
        className="btn btn-primary"
        disabled={isGenerating}
        onClick={() => onGenerateTurns(1)}
        style={{ whiteSpace: 'nowrap', position: 'relative' }}
      >
        {isGenerating ? (
          <span className="loading-pulse">Генерация...</span>
        ) : (
          'Следующий ход'
        )}
      </button>

      {/* ===== Custom Turn Count ===== */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input
          className="input"
          type="number"
          min={1}
          max={100}
          value={customTurnCount}
          onChange={(e) => {
            const val = Math.max(1, Math.min(100, Number(e.target.value)));
            setCustomTurnCount(val);
          }}
          onKeyDown={handleCustomKeyDown}
          disabled={isGenerating}
          style={{ width: '70px', textAlign: 'center' }}
        />
        <button
          className="btn btn-primary"
          disabled={isGenerating}
          onClick={handleCustomGenerate}
          style={{ whiteSpace: 'nowrap' }}
        >
          {isGenerating ? (
            <span className="loading-pulse">...</span>
          ) : (
            'Запуск'
          )}
        </button>
      </div>

      {/* ===== Separator ===== */}
      <div
        style={{
          width: '1px',
          height: '24px',
          backgroundColor: 'var(--border)',
          flexShrink: 0,
        }}
      />

      {/* ===== Save Button ===== */}
      <button
        className="btn btn-secondary"
        onClick={onSave}
        disabled={isGenerating}
        style={{ whiteSpace: 'nowrap' }}
      >
        Сохранить
      </button>

      {/* ===== World Editor Button ===== */}
      <button
        className="btn btn-secondary"
        onClick={onOpenWorldEditor}
        style={{ whiteSpace: 'nowrap' }}
      >
        Редактор мира
      </button>

      {/* ===== Summary Button ===== */}
      <button
        className="btn btn-secondary"
        onClick={onOpenSummary}
        disabled={isGenerating}
        style={{ whiteSpace: 'nowrap' }}
      >
        Саммари
      </button>

      {/* ===== Separator ===== */}
      <div
        style={{
          width: '1px',
          height: '24px',
          backgroundColor: 'var(--border)',
          flexShrink: 0,
        }}
      />

      {/* ===== Message to Agents ===== */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 220px', minWidth: '180px' }}>
        <input
          className="input"
          type="text"
          placeholder="Сообщение агентам..."
          value={godMessage}
          onChange={(e) => setGodMessage(e.target.value)}
          onKeyDown={handleMessageKeyDown}
          disabled={isGenerating}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          className="btn btn-primary"
          onClick={handleSendMessage}
          disabled={isGenerating || !godMessage.trim()}
          style={{ whiteSpace: 'nowrap' }}
        >
          Отправить
        </button>
      </div>

      {/* ===== Separator ===== */}
      <div
        style={{
          width: '1px',
          height: '24px',
          backgroundColor: 'var(--border)',
          flexShrink: 0,
        }}
      />

      {/* ===== Back Button ===== */}
      <button
        className="btn btn-secondary"
        onClick={onBackToSetup}
        disabled={isGenerating}
        style={{ whiteSpace: 'nowrap' }}
      >
        Назад
      </button>
    </div>
  );
}
