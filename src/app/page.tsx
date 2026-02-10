'use client';

import { useState } from 'react';
import SetupScreen from '@/components/SetupScreen';
import GameView from '@/components/GameView';
import { GameState } from '@/types';

export default function Home() {
  const [game, setGame] = useState<GameState | null>(null);

  if (game) {
    return (
      <GameView
        initialGame={game}
        onBackToSetup={() => setGame(null)}
      />
    );
  }

  return <SetupScreen onGameCreated={(g) => setGame(g)} />;
}
