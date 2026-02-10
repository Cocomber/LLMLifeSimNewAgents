import { GameState, SaveFile, SaveMeta } from '@/types';
import fs from 'fs';
import path from 'path';

const SAVES_DIR = path.join(process.cwd(), 'saves');

function ensureSavesDir(): void {
  if (!fs.existsSync(SAVES_DIR)) {
    fs.mkdirSync(SAVES_DIR, { recursive: true });
  }
}

/**
 * Strip apiKeys from a GameState for secure serialization.
 * Returns a deep copy with all API key values set to empty strings.
 */
function stripApiKeys(gameState: GameState): GameState {
  const sanitized = JSON.parse(JSON.stringify(gameState)) as GameState;
  if (sanitized.apiKeys) {
    for (const key of Object.keys(sanitized.apiKeys) as Array<keyof typeof sanitized.apiKeys>) {
      sanitized.apiKeys[key] = '';
    }
  }
  return sanitized;
}

/**
 * Save the game state to a JSON file.
 * API keys are stripped (set to empty strings) for security.
 * Returns the filename of the created save.
 */
export function saveGame(gameState: GameState, name?: string): string {
  ensureSavesDir();

  const filename = `save_${gameState.id}_${Date.now()}.json`;
  const filePath = path.join(SAVES_DIR, filename);

  const sanitizedState = stripApiKeys(gameState);

  const saveFile: SaveFile = {
    version: '1.0',
    gameState: sanitizedState,
    savedAt: new Date().toISOString(),
  };

  fs.writeFileSync(filePath, JSON.stringify(saveFile, null, 2), 'utf-8');

  return filename;
}

/**
 * Load a game state from a JSON save file.
 * Throws an error if the file is not found.
 */
export function loadGame(filename: string): GameState {
  const filePath = path.join(SAVES_DIR, filename);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Save file not found: ${filename}`);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const saveFile: SaveFile = JSON.parse(raw);

  return saveFile.gameState;
}

/**
 * List all save files in the saves directory.
 * Returns metadata for each save, sorted by savedAt descending (newest first).
 */
export function listSaves(): SaveMeta[] {
  ensureSavesDir();

  const files = fs.readdirSync(SAVES_DIR).filter((f) => f.endsWith('.json'));
  const metas: SaveMeta[] = [];

  for (const file of files) {
    try {
      const filePath = path.join(SAVES_DIR, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const saveFile: SaveFile = JSON.parse(raw);

      metas.push({
        id: file, // Use full filename as id so the load API can find it
        name: file.replace('.json', ''),
        turn: saveFile.gameState.currentTurn,
        agentCount: saveFile.gameState.agents.length,
        savedAt: saveFile.savedAt,
      });
    } catch {
      // Skip files that cannot be parsed
      continue;
    }
  }

  metas.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());

  return metas;
}

/**
 * Delete a save file.
 * Returns true if the file was deleted, false if it was not found.
 */
export function deleteSave(filename: string): boolean {
  const filePath = path.join(SAVES_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return false;
  }

  fs.unlinkSync(filePath);
  return true;
}

/**
 * Export each turn from the game's turn history as a separate JSON file.
 * Files are named turn_0001.json, turn_0002.json, etc.
 * Creates the output directory if it does not exist.
 */
export function exportTurnHistory(gameState: GameState, outputDir?: string): void {
  const dir = outputDir ?? path.join(SAVES_DIR, `export_${gameState.id}`);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  for (const turnRecord of gameState.turnHistory) {
    const turnNumber = String(turnRecord.turnId).padStart(4, '0');
    const filename = `turn_${turnNumber}.json`;
    const filePath = path.join(dir, filename);

    fs.writeFileSync(filePath, JSON.stringify(turnRecord, null, 2), 'utf-8');
  }
}

/**
 * Auto-save the game state with a fixed naming convention.
 * Overwrites any previous autosave for the same game ID.
 * Returns the filename of the autosave.
 */
export function autoSave(gameState: GameState): string {
  ensureSavesDir();

  const filename = `autosave_${gameState.id}.json`;
  const filePath = path.join(SAVES_DIR, filename);

  const sanitizedState = stripApiKeys(gameState);

  const saveFile: SaveFile = {
    version: '1.0',
    gameState: sanitizedState,
    savedAt: new Date().toISOString(),
  };

  fs.writeFileSync(filePath, JSON.stringify(saveFile, null, 2), 'utf-8');

  return filename;
}
