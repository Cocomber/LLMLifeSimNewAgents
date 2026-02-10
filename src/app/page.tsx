'use client';

import { useState } from 'react';
import SetupScreen from '@/components/SetupScreen';
import GameView from '@/components/GameView';
import { GameState, ApiKeys } from '@/types';

export default function Home() {
  const [game, setGame] = useState<GameState | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});

  if (game) {
    return (
      <GameView
        initialGame={game}
        apiKeys={apiKeys}
        onBackToSetup={() => setGame(null)}
      />
    );
  }

  return (
    <SetupScreen
      onGameCreated={(g, keys) => {
        setApiKeys(keys);
        setGame(g);
      }}
    />
  );
}
