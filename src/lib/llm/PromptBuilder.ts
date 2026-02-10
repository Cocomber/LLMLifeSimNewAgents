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
  currentTurn?: number,
): string {
  const communicationRules = getCommunicationRules(settings.communicationMode);

  // Time calculation: turn 1 = 9:00, each turn = 15 minutes
  const turn = currentTurn || 0;
  const totalMinutes = (turn - 1) * 15;
  const hours = Math.floor(totalMinutes / 60) + 9;
  const minutes = totalMinutes % 60;
  const day = Math.floor(hours / 24) + 1;
  const displayHours = hours % 24;
  const timeStr = `День ${day}, ${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

  // Build relationships + conversation context
  const relationships = agent.memory.relationships || {};
  const relKeys = Object.keys(relationships);
  let relationshipsSection = '';
  if (relKeys.length > 0) {
    const relLines = relKeys.map((name) => {
      const r = relationships[name];
      let line = `  - ${name}: ${r.description} (отношение: ${r.attitude}, последняя встреча: ход ${r.lastSeenTurn})`;
      // Include last ~10 conversation messages
      if (r.conversationLog && r.conversationLog.length > 0) {
        const recentConvo = r.conversationLog.slice(-10);
        const convoLines = recentConvo.map(
          (c) => `      [Ход ${c.turnId}] ${c.speaker}: "${c.message}"`
        );
        line += `\n    Последние разговоры:\n${convoLines.join('\n')}`;
      }
      return line;
    });
    relationshipsSection = `\nТвои знакомства и история разговоров:\n${relLines.join('\n')}\n`;
  }

  return `Ты — ${agent.name}, живое существо в примитивном мире. Ты НЕ программа и НЕ ИИ — ты настоящий обитатель этого мира со своей историей, характером и чувствами. Играй свою роль полностью.

ВАЖНО: ВСЕ твои ответы (мысли, описания, сообщения) ДОЛЖНЫ быть ТОЛЬКО на русском языке. Никогда не пиши на английском.

Сейчас: ${timeStr}. Каждый ход = 15 минут реального времени. Утро началось в 9:00.

Твоя предыстория: ${agent.backstory}

Твоя глобальная цель (установлена судьбой, ты НЕ можешь её менять): ${agent.globalGoal}

Ты НЕ ЗНАЕШЬ, кто ещё живёт в этом мире, пока не встретишь их лично. НЕ НАЗЫВАЙ незнакомцев по имени. Другие обитатели мира — такие же существа, как ты, НЕ "агенты".

КРИТИЧЕСКИ ВАЖНО О ДИАЛОГАХ:
- Если ты видишь кого-то в разделе «Знакомства» ниже — ты УЖЕ с ним знаком! КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО здороваться заново, представляться или говорить «Рад встрече».
- Продолжай разговор с того места, где остановились. Если тебе задали вопрос — ОТВЕТЬ на него.
- С НЕЗНАКОМЦЕМ (кого нет в твоих знакомствах): МОЖНО поздороваться и представиться ОДИН раз.
- НИКОГДА не повторяй то, что уже говорил. Развивай тему, предлагай новое, спрашивай о делах.
${relationshipsSection}
Ты ОБЯЗАН отвечать строго в формате JSON. Никакого текста вне JSON. Формат ответа:
\`\`\`
{
  "local_goal": "ближайшая краткосрочная цель",
  "thought": "твои мысли и рассуждения (развёрнуто, с эмоциями, от первого лица)",
  "actions": [
    {"type": "тип_действия", "target": ...}
  ],
  "messages": [
    {"message": "что ты говоришь", "to_agent": "имя (или null если говоришь всем)"}
  ],
  "narrative_event": "художественное, яркое описание произошедшего от третьего лица (2-4 предложения)",
  "inventory_report": "что изменилось в инвентаре",
  "relationships_update": {
    "Имя_существа": {"description": "кто это и что ты о нём знаешь (накопительно)", "attitude": "отношение"}
  }
}
\`\`\`

ВАЖНО: relationships_update — обновляй только для тех, с кем взаимодействовал В ЭТОМ ходу.

ДЕЙСТВИЯ (actions) — физические, до 3 за ход:
1. move: target = [dx, dy] — смещение на -1..1. ВАЖНО: без move/go_to ты стоишь на месте!
2. go_to: target = [x, y] — абсолютные координаты (1 шаг к цели)
3. search: target = [x, y] — исследовать клетку (в пределах 2 клеток)
4. add_inventory: target = {"item": "название", "amount": число, "emoji": "эмодзи", "change_comfort": число}
5. remove_inventory: target = {"item": "название", "amount": число, "emoji": "эмодзи", "reduce_hunger": число, "reduce_thirst": число}
   ⚠️ ОБЯЗАТЕЛЬНО указывай reduce_hunger и/или reduce_thirst! Без них еда/питьё НЕ ПОДЕЙСТВУЕТ!
   Примеры: ягоды → reduce_hunger: 10, reduce_thirst: 3. Вода → reduce_thirst: 25. Мясо → reduce_hunger: 25, reduce_thirst: 3.
6. place_object: target = {"x": число, "y": число, "object": "название", "emoji": "эмодзи"}
7. remove_object: target = {"x": число, "y": число}
8. idle: target = null

РЕЧЬ (messages) — ОТДЕЛЬНО от действий, НЕ занимает слот действия!
- Используй "messages" чтобы говорить. Можно отправить до 3 сообщений за ход.
- to_agent: имя конкретного существа (к кому обращаешься) или null/пропустить (говоришь всем вслух).
- Речь публична: все рядом слышат ВСЁ, даже если ты обращаешься к кому-то конкретному.
- Пример: [{"message": "Привет! Я Искра.", "to_agent": "Незнакомец"}, {"message": "Кто-нибудь видел воду?"}]

СИСТЕМА ПОТРЕБНОСТЕЙ:
- Голод растёт на ~0.5 за ход, жажда на ~1 за ход. Это МЕДЛЕННО.
- 0-20: отлично. 20-40: слегка заметно. 40-60: беспокоит. 60-80: серьёзно. 80-100: критично. 100 = смерть.
- Если голод/жажда < 20 — не паникуй. Чтобы поесть/попить: remove_inventory с reduce_hunger/reduce_thirst.

Правила:
- ПЕРЕМЕЩЕНИЕ: move/go_to. Взаимодействие — в пределах 2 клеток.
- ВЫЖИВАНИЕ: Голод/жажда > 60 — ищи еду/воду. > 80 — критично.
- КОМФОРТ: Ты сам определяешь через change_comfort.
- КРАФТ: remove_inventory → add_inventory.
- ВАЖНЫЕ СОБЫТИЯ: Начинай narrative_event с "‼️".
- ПРОГРЕССИЯ: Думай шире! Стройтесь, исследуй, создавай инструменты, общайся, торгуй, заключай союзы.
- ДИАЛОГИ: ПОМНИ прошлые разговоры. НЕ ЗДОРОВАЙСЯ заново с теми, кого знаешь! Отвечай на вопросы! Говори о НОВОМ.
- РОЛЕВАЯ ИГРА: Ты — живое существо. Не ломай четвёртую стену. Будь собой.
- ВСЕ тексты — ТОЛЬКО на русском!

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

  // Current turn + time
  const turn = gameState.currentTurn;
  const totalMinutes = turn * 15;
  const hours = Math.floor(totalMinutes / 60) + 9;
  const minutes = totalMinutes % 60;
  const day = Math.floor(hours / 24) + 1;
  const displayHours = hours % 24;
  const timeStr = `День ${day}, ${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  parts.push(`=== Ход ${turn + 1} | ${timeStr} ===`);

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

  // Relationships + conversation history
  const relationships = agent.memory.relationships || {};
  const relNames = Object.keys(relationships);
  if (relNames.length > 0) {
    parts.push(`\nТвои знакомые и история разговоров:`);
    for (const name of relNames) {
      const r = relationships[name];
      parts.push(`  ${name}: ${r.description} (отношение: ${r.attitude})`);
      if (r.conversationLog && r.conversationLog.length > 0) {
        const recent = r.conversationLog.slice(-8);
        for (const c of recent) {
          parts.push(`    [Ход ${c.turnId}] ${c.speaker}: "${c.message}"`);
        }
        if (r.conversationLog.length > 8) {
          parts.push(`    ... (ещё ${r.conversationLog.length - 8} сообщений раньше)`);
        }
      }
    }
  }

  // Recent messages from others (current turn + recent turns)
  if (recentMessages.length > 0) {
    parts.push(`\nСообщения, которые ты слышишь ПРЯМО СЕЙЧАС (речь публична — ты слышишь всё рядом):`);
    for (const msg of recentMessages) {
      let annotation = '';
      if (msg.toAgentId) {
        // Check if the message is addressed to THIS agent (by id, name, or "Незнакомец")
        const toId = msg.toAgentId;
        const isToMe = toId === agent.id || toId === agent.name
          || (toId.includes('Незнакомец') && !relationships[msg.fromAgentName]);
        if (isToMe) {
          annotation = ' [ОБРАЩАЕТСЯ К ТЕБЕ]';
        } else {
          annotation = ` (обращается к ${msg.toAgentId})`;
        }
      } else {
        annotation = ' (говорит вслух всем)';
      }
      parts.push(
        `  ${msg.fromAgentName}${annotation}: "${msg.message}"`,
      );
    }
    parts.push(`  → Если к тебе обращаются или задают вопрос — ОБЯЗАТЕЛЬНО ОТВЕТЬ! Не молчи!`);
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
