'use client';

import React, { useState, useCallback, useMemo } from 'react';
import type { GameState, AgentState, WorldState, TurnRecord, WorldObject, ApiKeys } from '@/types';
import GameMap from './GameMap';
import AgentPanel from './AgentPanel';
import AgentDetailModal from './AgentDetailModal';
import ControlPanel from './ControlPanel';
import PlaybackControls from './PlaybackControls';
import WorldEditor from './WorldEditor';
import SummaryModal from './SummaryModal';

interface GameViewProps {
  initialGame: GameState;
  apiKeys: ApiKeys;
  onBackToSetup: () => void;
}

export default function GameView({ initialGame, apiKeys, onBackToSetup }: GameViewProps) {
  const [game, setGame] = useState<GameState>(initialGame);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [detailAgentId, setDetailAgentId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showWorldEditor, setShowWorldEditor] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [currentViewTurn, setCurrentViewTurn] = useState<number>(game.currentTurn);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Helper: build body with apiKeys and gameState backup for state recovery
  const withRecovery = useCallback((body: Record<string, any>) => {
    return { ...body, apiKeys, gameState: game };
  }, [apiKeys, game]);

  // ==================== Playback Logic ====================

  const getDisplayState = useCallback((): {
    displayWorld: WorldState;
    displayAgents: AgentState[];
  } => {
    if (currentViewTurn === 0 || currentViewTurn >= game.currentTurn) {
      return { displayWorld: game.world, displayAgents: game.agents };
    }
    const record = game.turnHistory.find((r) => r.turnId === currentViewTurn);
    if (!record) {
      return { displayWorld: game.world, displayAgents: game.agents };
    }
    const historicalWorld: WorldState = {
      width: game.world.width,
      height: game.world.height,
      objects: record.worldSnapshot,
    };
    const historicalAgents: AgentState[] = game.agents.map((agent) => {
      const turnData = record.agentTurns[agent.id];
      if (!turnData) return agent;
      return {
        ...agent,
        position: turnData.position,
        needs: turnData.needs,
        inventory: turnData.inventory,
        globalGoal: turnData.globalGoal,
        localGoal: turnData.localGoal,
      };
    });
    return { displayWorld: historicalWorld, displayAgents: historicalAgents };
  }, [currentViewTurn, game]);

  const { displayWorld, displayAgents } = useMemo(() => getDisplayState(), [getDisplayState]);

  // ==================== Handlers ====================

  const handleGenerateTurns = useCallback(async (count: number) => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/game/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withRecovery({ count })),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || 'Ошибка генерации хода'); return; }
      setGame(data.game);
      setCurrentViewTurn(data.game.currentTurn);
    } catch (err: any) {
      setError(err.message || 'Сетевая ошибка');
    } finally {
      setIsGenerating(false);
    }
  }, [withRecovery]);

  const handleSave = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/game/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withRecovery({})),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || 'Ошибка сохранения'); return; }
      setSaveMessage('Игра сохранена!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Сетевая ошибка');
    }
  }, [withRecovery]);

  const handleGoalChange = useCallback(async (agentId: string, newGoal: string) => {
    setError(null);
    try {
      const res = await fetch('/api/game/agent-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withRecovery({ agentId, globalGoal: newGoal })),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || 'Ошибка изменения цели'); return; }
      setGame(data.game);
    } catch (err: any) {
      setError(err.message || 'Сетевая ошибка');
    }
  }, [withRecovery]);

  const handleSendMessage = useCallback(async (message: string) => {
    setError(null);
    try {
      const res = await fetch('/api/game/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withRecovery({ message })),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || 'Ошибка отправки сообщения'); return; }
      setGame(data.game);
    } catch (err: any) {
      setError(err.message || 'Сетевая ошибка');
    }
  }, [withRecovery]);

  const handleAddObject = useCallback(async (obj: {
    type: string; emoji: string; position: { x: number; y: number }; properties?: Record<string, any>;
  }) => {
    setError(null);
    try {
      const res = await fetch('/api/game/world-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withRecovery({ action: 'add_object', object: { ...obj, id: '' } })),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || 'Ошибка добавления объекта'); return; }
      setGame(data.game);
    } catch (err: any) {
      setError(err.message || 'Сетевая ошибка');
    }
  }, [withRecovery]);

  const handleRemoveObject = useCallback(async (objectId: string) => {
    setError(null);
    try {
      const res = await fetch('/api/game/world-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withRecovery({ action: 'remove_object', objectId })),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || 'Ошибка удаления объекта'); return; }
      setGame(data.game);
    } catch (err: any) {
      setError(err.message || 'Сетевая ошибка');
    }
  }, [withRecovery]);

  const handleAnnounce = useCallback(async (message: string) => {
    setError(null);
    try {
      const res = await fetch('/api/game/world-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withRecovery({ action: 'announce', message })),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || 'Ошибка объявления'); return; }
      setGame(data.game);
    } catch (err: any) {
      setError(err.message || 'Сетевая ошибка');
    }
  }, [withRecovery]);

  const handleViewTurn = useCallback((turnId: number) => { setCurrentViewTurn(turnId); }, []);

  const detailAgent = useMemo(() => {
    if (!detailAgentId) return null;
    return game.agents.find((a) => a.id === detailAgentId) ?? null;
  }, [detailAgentId, game.agents]);

  const isViewingHistory = currentViewTurn > 0 && currentViewTurn < game.currentTurn;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', position: 'relative' }}>
      {error && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, background: '#dc2626', color: '#fff', padding: '10px 20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span>Ошибка: {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.5)', color: '#fff', borderRadius: '4px', padding: '2px 10px', cursor: 'pointer', fontSize: '0.8rem', flexShrink: 0 }}>Закрыть</button>
        </div>
      )}
      {saveMessage && (
        <div style={{ position: 'absolute', top: error ? '44px' : '0', left: 0, right: 0, zIndex: 99, background: '#16a34a', color: '#fff', padding: '8px 20px', fontSize: '0.85rem', textAlign: 'center' }}>{saveMessage}</div>
      )}
      {isViewingHistory && (
        <div style={{ position: 'absolute', top: error ? '44px' : saveMessage ? '40px' : '0', left: 0, right: 0, zIndex: 98, background: 'rgba(234, 179, 8, 0.9)', color: '#1a1a1a', padding: '6px 20px', fontSize: '0.8rem', textAlign: 'center', fontWeight: 600 }}>
          Просмотр истории: ход {currentViewTurn} из {game.currentTurn}
        </div>
      )}

      <div style={{ flexShrink: 0 }}>
        <ControlPanel currentTurn={game.currentTurn} isGenerating={isGenerating} onGenerateTurns={handleGenerateTurns} onSave={handleSave} onOpenWorldEditor={() => setShowWorldEditor(true)} onSendMessage={handleSendMessage} onBackToSetup={onBackToSetup} onOpenSummary={() => setShowSummary(true)} />
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Map - larger area */}
        <div style={{ flex: '1 1 70%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', overflow: 'auto' }}>
          <GameMap world={displayWorld} agents={displayAgents} selectedAgentId={selectedAgentId} currentTurn={isViewingHistory ? currentViewTurn : game.currentTurn} />
        </div>

        {/* Agent sidebar */}
        <div style={{ flex: '0 0 30%', minWidth: '320px', maxWidth: '420px', overflowY: 'auto', padding: '12px', borderLeft: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Агенты ({displayAgents.length})
          </div>
          <AgentPanel agents={displayAgents} selectedAgentId={selectedAgentId} onSelectAgent={setSelectedAgentId} onOpenDetail={setDetailAgentId} />
        </div>
      </div>

      <div style={{ flexShrink: 0 }}>
        <PlaybackControls turnHistory={game.turnHistory} currentViewTurn={currentViewTurn} onViewTurn={handleViewTurn} maxTurn={game.currentTurn} agents={game.agents} />
      </div>

      {detailAgent && (
        <AgentDetailModal agent={detailAgent} turnHistory={game.turnHistory} onClose={() => setDetailAgentId(null)} onGoalChange={handleGoalChange} />
      )}
      {showWorldEditor && (
        <WorldEditor world={game.world} onClose={() => setShowWorldEditor(false)} onAddObject={handleAddObject} onRemoveObject={handleRemoveObject} onAnnounce={handleAnnounce} />
      )}
      {showSummary && (
        <SummaryModal turnHistory={game.turnHistory} agents={game.agents} maxTurn={game.currentTurn} apiKeys={apiKeys as Record<string, string | undefined>} onClose={() => setShowSummary(false)} />
      )}
    </div>
  );
}
