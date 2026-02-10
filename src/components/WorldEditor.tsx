'use client';

import React, { useState } from 'react';
import type { WorldState, WorldObject } from '@/types';

interface WorldEditorProps {
  world: WorldState;
  onClose: () => void;
  onAddObject: (obj: {
    type: string;
    emoji: string;
    position: { x: number; y: number };
    properties?: Record<string, any>;
  }) => void;
  onRemoveObject: (objectId: string) => void;
  onAnnounce: (message: string) => void;
}

const PRESETS: { emoji: string; type: string }[] = [
  { emoji: '\uD83C\uDF33', type: 'Дерево' },
  { emoji: '\uD83D\uDCA7', type: 'Вода' },
  { emoji: '\uD83C\uDF53', type: 'Ягоды' },
  { emoji: '\uD83D\uDDFF', type: 'Камень' },
  { emoji: '\uD83C\uDF3F', type: 'Куст' },
  { emoji: '\uD83D\uDD25', type: 'Костер' },
  { emoji: '\uD83C\uDFE0', type: 'Дом' },
];

export default function WorldEditor({
  world,
  onClose,
  onAddObject,
  onRemoveObject,
  onAnnounce,
}: WorldEditorProps) {
  // ---- Add object form state ----
  const [newEmoji, setNewEmoji] = useState('');
  const [newType, setNewType] = useState('');
  const [newX, setNewX] = useState(0);
  const [newY, setNewY] = useState(0);

  // ---- Announce state ----
  const [announcement, setAnnouncement] = useState('');

  const handleAddObject = () => {
    const trimmedType = newType.trim();
    const trimmedEmoji = newEmoji.trim();
    if (!trimmedType || !trimmedEmoji) return;

    onAddObject({
      type: trimmedType,
      emoji: trimmedEmoji,
      position: { x: newX, y: newY },
    });

    setNewEmoji('');
    setNewType('');
    setNewX(0);
    setNewY(0);
  };

  const handlePresetClick = (preset: { emoji: string; type: string }) => {
    setNewEmoji(preset.emoji);
    setNewType(preset.type);
  };

  const handleAnnounce = () => {
    const trimmed = announcement.trim();
    if (trimmed) {
      onAnnounce(trimmed);
      setAnnouncement('');
    }
  };

  const maxX = (world.width ?? 20) - 1;
  const maxY = (world.height ?? 20) - 1;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
      >
        {/* ===== Header ===== */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
            Редактор мира
          </h2>
          <button
            className="btn btn-secondary"
            onClick={onClose}
            style={{ padding: '4px 10px', fontSize: '1.1rem', lineHeight: 1 }}
          >
            X
          </button>
        </div>

        {/* ===== Add Object Section ===== */}
        <div>
          <div className="panel-header">Добавить объект</div>

          {/* Preset buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {PRESETS.map((preset) => (
              <button
                key={preset.type}
                type="button"
                className="btn btn-secondary"
                onClick={() => handlePresetClick(preset)}
                style={{ fontSize: '0.8rem', padding: '5px 10px' }}
              >
                {preset.emoji} {preset.type}
              </button>
            ))}
          </div>

          {/* Input fields */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr 70px 70px',
              gap: '8px',
              alignItems: 'end',
            }}
          >
            {/* Emoji */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.7rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '3px',
                }}
              >
                Эмодзи
              </label>
              <input
                className="input"
                type="text"
                value={newEmoji}
                onChange={(e) => setNewEmoji(e.target.value)}
                placeholder="..."
                style={{ textAlign: 'center' }}
              />
            </div>

            {/* Type / name */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.7rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '3px',
                }}
              >
                Тип / название
              </label>
              <input
                className="input"
                type="text"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                placeholder="Например: Дерево"
              />
            </div>

            {/* X */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.7rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '3px',
                }}
              >
                X (0-{maxX})
              </label>
              <input
                className="input"
                type="number"
                min={0}
                max={maxX}
                value={newX}
                onChange={(e) => setNewX(Math.max(0, Math.min(maxX, Number(e.target.value))))}
                style={{ textAlign: 'center' }}
              />
            </div>

            {/* Y */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.7rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '3px',
                }}
              >
                Y (0-{maxY})
              </label>
              <input
                className="input"
                type="number"
                min={0}
                max={maxY}
                value={newY}
                onChange={(e) => setNewY(Math.max(0, Math.min(maxY, Number(e.target.value))))}
                style={{ textAlign: 'center' }}
              />
            </div>
          </div>

          {/* Add button */}
          <button
            className="btn btn-primary"
            onClick={handleAddObject}
            disabled={!newEmoji.trim() || !newType.trim()}
            style={{ marginTop: '10px', width: '100%' }}
          >
            Добавить
          </button>
        </div>

        {/* ===== Current Objects List ===== */}
        <div>
          <div className="panel-header">
            Объекты в мире ({world.objects.length})
          </div>
          {world.objects.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Нет объектов
            </div>
          ) : (
            <div
              style={{
                maxHeight: '300px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {world.objects.map((obj: WorldObject) => (
                <div
                  key={obj.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    fontSize: '0.8rem',
                  }}
                >
                  <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>
                    {obj.emoji}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {obj.type}
                  </span>
                  <span
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: '0.75rem',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    ({obj.position.x}, {obj.position.y})
                  </span>
                  <button
                    className="btn btn-danger"
                    onClick={() => onRemoveObject(obj.id)}
                    style={{
                      padding: '3px 8px',
                      fontSize: '0.7rem',
                      flexShrink: 0,
                    }}
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== Announce Section ===== */}
        <div>
          <div className="panel-header">Объявление для агентов</div>
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              marginBottom: '8px',
              lineHeight: 1.4,
            }}
          >
            Это сообщение будет видно всем агентам на следующем ходу.
          </p>
          <textarea
            className="input"
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
            placeholder="Введите сообщение для всех агентов..."
            rows={3}
            style={{ resize: 'vertical', minHeight: '60px' }}
          />
          <button
            className="btn btn-primary"
            onClick={handleAnnounce}
            disabled={!announcement.trim()}
            style={{ marginTop: '8px', width: '100%' }}
          >
            Объявить
          </button>
        </div>
      </div>
    </div>
  );
}
