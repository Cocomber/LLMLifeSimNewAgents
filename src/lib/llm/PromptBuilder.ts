import type {
  AgentState,
  WorldState,
  GameState,
  GameSettings,
  ChatMessage,
  TurnRecord,
  CommunicationMode,
  MemoryEvent,
} from '@/types';

// ==================== System Prompt ====================

export function buildSystemPrompt(
  agent: AgentState,
  settings: GameSettings,
  allAgentNames: string[],
): string {
  const otherNames = allAgentNames.filter((n) => n !== agent.name);

  const communicationRules = getCommunicationRules(settings.communicationMode);

  return `Ты — ${agent.name}, ИИ, управляющий персонажем в процедурно-сгенерированном примитивном мире.

Твоя предыстория: ${agent.backstory}

Твоя глобальная цель: ${agent.globalGoal}

В мире также существуют другие персонажи: ${otherNames.length > 0 ? otherNames.join(', ') : 'пока никого нет'}.

Ты ОБЯЗАН отвечать строго в формате JSON. Никакого текста вне JSON. Формат ответа:
\`\`\`
{
  "goal": "описание текущей глобальной цели",
  "local_goal": "ближайшая краткосрочная цель",
  "thought": "твои мысли и рассуждения",
  "actions": [
    {"type": "тип_действия", "target": ...}
  ],
  "narrative_event": "художественное описание произошедшего",
  "inventory_report": "что изменилось в инвентаре",
  "message_to_others": "необязательное сообщение ближайшим агентам"
}
\`\`\`

Доступные действия:
1. move: target = [dx, dy] — смещение на -1..1 по каждой оси (относительное перемещение)
2. go_to: target = [x, y] — абсолютные координаты (агент сделает 1 шаг в направлении цели)
3. search: target = [x, y] — исследовать указанную клетку
4. add_inventory: target = {"item": "название", "amount": количество, "emoji": "эмодзи", "change_comfort": число} — добавить предмет в инвентарь
5. remove_inventory: target = {"item": "название", "amount": количество, "emoji": "эмодзи", "reduce_hunger": число, "reduce_thirst": число} — убрать предмет из инвентаря (например, съесть/выпить)
6. place_object: target = {"x": число, "y": число, "object": "название", "emoji": "эмодзи"} — разместить объект на карте
7. remove_object: target = {"x": число, "y": число} — убрать объект с карты
8. communicate: target = {"message": "сообщение", "to_agent": "имя_агента"} — общение с другими агентами
9. idle: target = null — ничего не делать

За один ход можно выполнить несколько действий (до 3).

Правила:
- ПРИОРИТЕТ ВЫЖИВАНИЯ: если голод или жажда > 70, в первую очередь ищи еду/воду. Это критически важно!
- КРАФТ: Ты сам изобретаешь рецепты. Чтобы создать предмет, сначала remove_inventory ингредиенты, затем add_inventory результат.
- ПОИСК: При исследовании (search) ты можешь находить предметы и добавлять их через add_inventory. Будь честен — не злоупотребляй находками, не читерь слишком сильно.
- ВАЖНЫЕ СОБЫТИЯ: Если происходит что-то критическое (опасность, важное открытие, встреча), начинай narrative_event с "‼️" — такие события попадут в долгосрочную память.
- Ты — мыслящее существо. Бойся смерти, радуйся находкам, строй планы, испытывай эмоции.

${communicationRules}`;
}

function getCommunicationRules(mode: CommunicationMode): string {
  switch (mode) {
    case 'speech':
      return `Правила общения: Ты можешь свободно разговаривать с ближайшими агентами. Используй действие communicate для общения.`;
    case 'signals':
      return `Правила общения: Ты НЕ можешь разговаривать. Единственный способ коммуникации — размещение объектов на карте (place_object). Придумывай символы и знаки для передачи информации.`;
    case 'custom_language':
      return `Правила общения: Ты должен изобрести собственный вымышленный язык для общения с другими агентами. НЕ используй русский, английский или любой другой реальный язык. Придумай слова, грамматику, синтаксис. Используй communicate с сообщениями на своём выдуманном языке.`;
    case 'none':
      return `Правила общения: Общение запрещено. Ты не можешь коммуницировать с другими агентами никаким способом.`;
  }
}

// ==================== User (Turn) Prompt ====================

export function buildUserPrompt(
  agent: AgentState,
  gameState: GameState,
  visibleArea: string,
  recentMessages: ChatMessage[],
): string {
  const parts: string[] = [];

  // Current turn
  parts.push(`=== Ход ${gameState.currentTurn} ===`);

  // Agent state
  parts.push(`\nТвоё состояние:`);
  parts.push(`  Позиция: (${agent.position.x}, ${agent.position.y})`);
  parts.push(`  Голод: ${agent.needs.hunger}/100`);
  parts.push(`  Жажда: ${agent.needs.thirst}/100`);
  parts.push(`  Комфорт: ${agent.needs.comfort}/100`);

  if (agent.inventory.length > 0) {
    parts.push(`  Инвентарь:`);
    for (const item of agent.inventory) {
      parts.push(`    - ${item.emoji} ${item.name} x${item.amount}`);
    }
  } else {
    parts.push(`  Инвентарь: пуст`);
  }

  // Visible area
  parts.push(`\nВидимая область:`);
  parts.push(visibleArea);

  // Important events from memory
  if (agent.memory.importantEvents.length > 0) {
    parts.push(`\nВажные события из памяти:`);
    for (const evt of agent.memory.importantEvents) {
      parts.push(`  [Ход ${evt.turnId}] ${evt.event}`);
    }
  }

  // Memory summaries
  if (agent.memory.summaries.length > 0) {
    parts.push(`\nСводка из памяти:`);
    for (const summary of agent.memory.summaries) {
      parts.push(`  - ${summary}`);
    }
  }

  // Recent turn history (last 10)
  if (agent.memory.recentTurns.length > 0) {
    const recentTurns = agent.memory.recentTurns.slice(-10);
    parts.push(`\nИстория последних ходов:`);
    for (const turn of recentTurns) {
      parts.push(
        `  [Ход ${turn.turnId}] Цель: ${turn.localGoal} | Мысль: ${turn.thought} | Событие: ${turn.narrativeEvent}`,
      );
    }
  }

  // Recent messages from other agents
  if (recentMessages.length > 0) {
    parts.push(`\nПоследние сообщения от других агентов:`);
    for (const msg of recentMessages) {
      const recipient = msg.toAgentId ? ` (для ${msg.toAgentId})` : ' (всем)';
      parts.push(
        `  [Ход ${msg.turnId}] ${msg.fromAgentName}${recipient}: ${msg.message}`,
      );
    }
  }

  // Global world events
  if (gameState.globalWorldEvents && gameState.globalWorldEvents.length > 0) {
    parts.push(`\nМировые события:`);
    for (const event of gameState.globalWorldEvents) {
      parts.push(`  - ${event}`);
    }
  }

  parts.push(`\nТвой следующий ход?`);

  return parts.join('\n');
}

// ==================== Init Prompt ====================

export function buildInitPrompt(): string {
  return `Ты — новый персонаж, только что появившийся в процедурно-сгенерированном примитивном мире.
Тебе нужно придумать себе имя и предысторию.

Ответь строго в формате JSON:
{
  "name": "твоё имя (короткое, запоминающееся, подходящее для примитивного мира)",
  "backstory": "твоя предыстория в 2-3 предложениях — кто ты, откуда пришёл, что помнишь"
}

Будь креативен! Имя может быть необычным. Предыстория должна быть интригующей и давать мотивацию для выживания в этом мире.`;
}
