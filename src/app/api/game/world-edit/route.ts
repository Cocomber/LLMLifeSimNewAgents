import { NextResponse } from 'next/server';
import { getCurrentGame, setCurrentGame } from '@/lib/engine/GameState';
import { addObject, removeObject } from '@/lib/engine/World';
import { WorldObject } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
  try {
    const game = getCurrentGame();
    if (!game) {
      return NextResponse.json({ success: false, error: 'No active game' }, { status: 404 });
    }

    const body = await request.json();
    let updatedGame = { ...game };

    switch (body.action) {
      case 'add_object': {
        const obj: WorldObject = {
          ...body.object,
          id: body.object.id || uuidv4(),
        };
        updatedGame.world = addObject(game.world, obj);
        break;
      }
      case 'remove_object': {
        updatedGame.world = removeObject(game.world, body.objectId);
        break;
      }
      case 'announce': {
        updatedGame.globalWorldEvents = [
          ...game.globalWorldEvents,
          body.message,
        ];
        break;
      }
      default:
        return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
    }

    setCurrentGame(updatedGame);
    const responseGame = { ...updatedGame, apiKeys: {} };
    return NextResponse.json({ success: true, game: responseGame });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
