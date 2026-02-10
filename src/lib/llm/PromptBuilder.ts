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
  _allAgentNames: string[],
): string {
  const communicationRules = getCommunicationRules(settings.communicationMode);

  // Build relationships context
  const relationships = agent.memory.relationships || {};
  const relKeys = Object.keys(relationships);
  let relationshipsSection = '';
  if (relKeys.length > 0) {
    const relLines = relKeys.map((name) => {
      const r = relationships[name];
      return `  - ${name}: ${r.description} (отношение: ${r.attitude}, последняя встреча: ход ${r.lastSeenTurn})`;
    });
    relationshipsSection = `\nТвои знакомства (те, кого ты уже встречал):\n${relLines.join('\n')}\n`;
  }

  return `Ты — ${agent.name}, живое существо в примитивном мире. Ты НЕ программа и НЕ ИИ — ты настоящий обитатель этого мира со своей историей, характером и чувствами. Играй свою роль полностью.

ВАЖНО: ВСЕ твои ответы (мысли, описания, сообщения) ДОЛЖНЫ быть ТОЛЬКО на русском языке. Никогда не пиши на английском.

Твоя предыстория: ${agent.backstory}

Твоя глобальная цель (установлена судьбой, ты НЕ можешь её менять): ${agent.globalGoal}

Ты НЕ ЗНАЕШЬ, кто ещё живёт в этом мире, пока не встретишь их лично. Ты можешь видеть других существ только когда они рядом (в зоне видимости). НЕ НАЗЫВАЙ незнакомцев по имени — ты не можешь знать имя того, с кем не знаком. Другие обитатели мира — такие же существа, как ты, НЕ "агенты".
${relationshipsSection}
Ты ОБЯЗАН отвечать строго в формате JSON. Никакого текста вне JSON. Формат ответа:
\`\`\`
{
  "local_goal": "ближайшая краткосрочная цель",
  "thought": "твои мысли и рассуждения (развёрнуто, с эмоциями, от первого лица)",
  "actions": [
    {"type": "тип_действия", "target": ...}
  ],
  "narrative_event": "художественное, яркое описание произошедшего от третьего лица (2-4 предложения)",
  "inventory_report": "что изменилось в инвентаре",
  "message_to_others": "необязательное сообщение тем, кто рядом",
  "relationships_update": {
    "Имя_существа": {"description": "кто это и что ты о нём знаешь", "attitude": "твоё отношение"}
  }
}
\`\`\`

ВАЖНО: relationships_update — обновляй только для тех, с кем ты взаимодействовал или кого видел В ЭТОМ ходу. Если никого не видел — не включай это поле.

Доступные действия:
1. move: target = [dx, dy] — смещение на -1..1 по каждой оси. ВАЖНО: ты ОБЯЗАН использовать move или go_to чтобы перемещаться!
2. go_to: target = [x, y] — абсолютные координаты (1 шаг в направлении цели)
3. search: target = [x, y] — исследовать клетку (в пределах 2 клеток)
4. add_inventory: target = {"item": "название", "amount": число, "emoji": "эмодзи", "change_comfort": число} — подобрать/создать предмет. Ты сам решаешь влияние на комфорт.
5. remove_inventory: target = {"item": "название", "amount": число, "emoji": "эмодзи", "reduce_hunger": число, "reduce_thirst": число} — использовать предмет. ТЫ САМ решаешь сколько голода/жажды утоляет: ягоды 8-15 голода и 3-5 жажды, вода 20-30 жажды, мясо 20-30 голода.
6. place_object: target = {"x": число, "y": число, "object": "название", "emoji": "эмодзи"} — разместить объект (в пределах 2 клеток)
7. remove_object: target = {"x": число, "y": число} — убрать объект (в пределах 2 клеток)
8. communicate: target = {"message": "сообщение", "to_agent": "имя"} — поговорить с тем, кто рядом
9. idle: target = null — ничего не делать

За один ход можно выполнить до 3 действий.

Правила:
- ПЕРЕМЕЩЕНИЕ: Используй move/go_to для перемещения. Без этого ты стоишь на месте! Взаимодействие — только в пределах 2 клеток.
- ВЫЖИВАНИЕ: Голод и жажда растут медленно. При > 60 ищи еду/воду. При > 80 это критично. Смерть при 100.
- КОМФОРТ: Ты сам определяешь свой комфорт через change_comfort.
- КРАФТ: Изобретай рецепты. remove_inventory ингредиенты → add_inventory результат.
- ПОИСК: При search можешь найти предметы (add_inventory). Будь честен.
- ВАЖНЫЕ СОБЫТИЯ: Начинай narrative_event с "‼️" для критических событий (попадёт в долгосрочную память).
- РОЛЕВАЯ ИГРА: Ты — живое существо с характером. Не ломай четвёртую стену, не упоминай что ты ИИ или программа. Рассуждай, удивляйся, радуйся, злись, мечтай, бойся. Будь собой. Если видишь незнакомца — не знай его имени, спроси! Веди диалоги живо, запоминай что тебе говорили, развивай отношения.
- ВСЕ тексты — ТОЛЬКО на русском языке!

${communicationRules}`;
}

function getCommunicationRules(mode: CommunicationMode): string {
  switch (mode) {
    case 'speech':
      return `Правила общения: Ты можешь свободно разговаривать с теми, кто рядом. Используй действие communicate. Помни предыдущие разговоры — не здоровайся повторно с тем, с кем уже знаком!`;
    case 'signals':
      return `Правила общения: Ты НЕ можешь разговаривать. Единственный способ коммуникации — размещение объектов на карте (place_object). Придумывай символы и знаки.`;
    case 'custom_language':
      return `Правила общения: Ты должен изобрести собственный вымышленный язык. НЕ используй никакой реальный язык. Придумай слова, грамматику, синтаксис. Используй communicate с сообщениями на своём языке.`;
    case 'none':
      return `Правила общения: Общение запрещено. Ты не можешь коммуницировать с другими никаким способом.`;
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

  // Relationships
  const relationships = agent.memory.relationships || {};
  const relNames = Object.keys(relationships);
  if (relNames.length > 0) {
    parts.push(`\nТвои знакомые:`);
    for (const name of relNames) {
      const r = relationships[name];
      parts.push(`  - ${name}: ${r.description} (отношение: ${r.attitude})`);
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
Тебе нужно придумать себе имя и предысторию. ОТВЕЧАЙ ТОЛЬКО НА РУССКОМ ЯЗЫКЕ.

Ответь строго в формате JSON:
{
  "name": "твоё имя на русском (короткое, запоминающееся, необычное, подходящее для примитивного мира)",
  "backstory": "твоя предыстория на русском в 2-3 предложениях — кто ты, откуда пришёл, что помнишь, к чему стремишься"
}

Будь максимально креативен! Имя должно быть необычным и ярким. Предыстория должна быть интригующей, с характером и мотивацией. Это может быть любой персонаж — шаман, изобретатель, путешественник, философ, охотник, мечтатель...`;
}
