import type {
  AgentState,
  AgentMemory,
  MemoryEvent,
  TurnLog,
  AgentAction,
  AgentNeeds,
  Position,
} from '@/types';

const SHORT_TERM_LIMIT = 10;
const SUMMARY_INTERVAL = 20;
const CONTINUITY_KEEP = 2;

/**
 * Create an empty memory structure for a new agent.
 */
export function createEmptyMemory(): AgentMemory {
  return {
    importantEvents: [],
    recentTurns: [],
    summaries: [],
    relationships: {},
  };
}

/**
 * Add a turn to the agent's memory.
 *
 * - If the narrativeEvent starts with the "‼️" prefix, it is flagged as
 *   important and stored permanently in importantEvents.
 * - Only the last SHORT_TERM_LIMIT turns are kept in recentTurns.
 */
export function addTurnToMemory(
  memory: AgentMemory,
  turnLog: TurnLog,
  narrativeEvent: string,
): AgentMemory {
  const isImportant = narrativeEvent.startsWith('‼️');

  const updatedImportantEvents: MemoryEvent[] = isImportant
    ? [
        ...memory.importantEvents,
        {
          turnId: turnLog.turnId,
          event: narrativeEvent,
          important: true,
        },
      ]
    : memory.importantEvents;

  const updatedRecentTurns = [...memory.recentTurns, turnLog].slice(
    -SHORT_TERM_LIMIT,
  );

  return {
    ...memory,
    importantEvents: updatedImportantEvents,
    recentTurns: updatedRecentTurns,
  };
}

/**
 * Determine whether it is time to generate a compressed summary.
 * Returns true every SUMMARY_INTERVAL turns (i.e. turn 20, 40, 60, ...).
 */
export function shouldGenerateSummary(
  memory: AgentMemory,
  currentTurn: number,
): boolean {
  return currentTurn > 0 && currentTurn % SUMMARY_INTERVAL === 0;
}

/**
 * Build a prompt (in Russian) that asks the LLM to summarise the agent's
 * recent turns into a concise paragraph.
 */
export function generateMemorySummaryPrompt(memory: AgentMemory): string {
  const turnsText = memory.recentTurns
    .map((t) => {
      const actionsStr = (t.actions || []).map(a => a.type).join(', ') || 'idle';
      return (
        `Ход ${t.turnId}: позиция (${t.position.x}, ${t.position.y}), ` +
        `действия: [${actionsStr}], ` +
        `мысль: "${t.thought}", ` +
        `событие: "${t.narrativeEvent}", ` +
        `потребности: голод=${Math.round(t.needs.hunger)}, жажда=${Math.round(t.needs.thirst)}, комфорт=${Math.round(t.needs.comfort)}, ` +
        `цель: "${t.localGoal}"`
      );
    })
    .join('\n');

  return (
    `Ты — система управления памятью агента в симуляции жизни.\n` +
    `Ниже приведены последние события агента. Сожми их в один краткий абзац на русском языке, ` +
    `сохранив самые важные факты: ключевые действия, изменения состояния, встречи с другими агентами ` +
    `и прогресс к целям. Не добавляй ничего от себя — только факты из предоставленных данных.\n\n` +
    `--- Последние ходы ---\n${turnsText}\n\n` +
    `Напиши краткое резюме (1 абзац):`
  );
}

/**
 * Store an LLM-generated summary and trim recentTurns, keeping the last
 * CONTINUITY_KEEP entries so the agent retains minimal immediate context.
 */
export function addSummary(memory: AgentMemory, summary: string): AgentMemory {
  return {
    ...memory,
    summaries: [...memory.summaries, summary],
    recentTurns: memory.recentTurns.slice(-CONTINUITY_KEEP),
  };
}

/**
 * Format the full memory context for inclusion in an LLM prompt (in Russian).
 *
 * Sections included:
 *   1. Important events  (permanent store)
 *   2. Summaries         (compressed history)
 *   3. Recent turns      (short-term detail)
 */
export function getMemoryContext(memory: AgentMemory): string {
  const parts: string[] = [];

  // 1. Important events
  if (memory.importantEvents.length > 0) {
    const eventsText = memory.importantEvents
      .map((e) => `  [Ход ${e.turnId}] ${e.event}`)
      .join('\n');
    parts.push(`=== Важные события ===\n${eventsText}`);
  }

  // 2. Summaries
  if (memory.summaries.length > 0) {
    const summariesText = memory.summaries
      .map((s, i) => `  Период ${i + 1}: ${s}`)
      .join('\n');
    parts.push(`=== Сводки прошлых периодов ===\n${summariesText}`);
  }

  // 3. Recent turns
  if (memory.recentTurns.length > 0) {
    const recentText = memory.recentTurns
      .map((t) => {
        const actionsStr = (t.actions || []).map(a => a.type).join(', ') || 'idle';
        return (
          `  [Ход ${t.turnId}] позиция (${t.position.x}, ${t.position.y}) | ` +
          `действия: [${actionsStr}] | мысль: "${t.thought}" | ` +
          `событие: "${t.narrativeEvent}" | ` +
          `потребности: голод=${Math.round(t.needs.hunger)}, жажда=${Math.round(t.needs.thirst)}, комфорт=${Math.round(t.needs.comfort)}`
        );
      })
      .join('\n');
    parts.push(`=== Недавние ходы ===\n${recentText}`);
  }

  if (parts.length === 0) {
    return '(Память пуста — это начало симуляции.)';
  }

  return parts.join('\n\n');
}
