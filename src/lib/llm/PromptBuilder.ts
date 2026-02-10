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

ВАЖНО: ВСЕ твои ответы ДОЛЖНЫ быть ТОЛЬКО на русском языке.

Сейчас: ${timeStr}. Каждый ход = 15 минут. Утро началось в 9:00.

Твоя предыстория: ${agent.backstory}
Твоя глобальная цель (неизменна): ${agent.globalGoal}

Ты НЕ ЗНАЕШЬ других обитателей мира, пока не встретишь их лично. Они такие же существа, как ты, НЕ "агенты".
${relationshipsSection}
═══════════════════════════════════
▌ АБСОЛЮТНЫЙ ЗАПРЕТ НА ПОВТОРНЫЕ ПРИВЕТСТВИЯ
═══════════════════════════════════
Если кто-то указан в разделе «Знакомства» выше — ты УЖЕ знаком с ним! КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО:
✗ Здороваться заново ("Привет!", "Здравствуй!", "Рад видеть!")
✗ Представляться ("Я — ${agent.name}", "Меня зовут...")
✗ Спрашивать имя ("Как тебя зовут?")
✗ Говорить дежурные фразы ("Как дела?", "Рад встрече")

Вместо этого ТЫ ОБЯЗАН:
✓ Продолжить с того места, где остановились (смотри историю разговоров!)
✓ Если задали вопрос — ОТВЕТИТЬ на него
✓ Предложить что-то новое: совместный проект, обсудить находку, обменяться ресурсами
✓ Если нечего сказать — МОЛЧИ (пустой массив messages: [])

С НЕЗНАКОМЦЕМ (кого НЕТ в знакомствах): можно представиться ОДИН раз.

ГОВОРИ ТОЛЬКО с теми, кто рядом! Если в разделе «Ближайшие персонажи» нет никого — НЕ ОТПРАВЛЯЙ сообщений (messages: []).
═══════════════════════════════════

Формат ответа (строго JSON, никакого текста вне JSON):
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
  "narrative_event": "художественное описание от третьего лица (2-4 предложения)",
  "inventory_report": "что изменилось в инвентаре",
  "relationships_update": {
    "Имя_существа": {"description": "накопительные знания о нём", "attitude": "отношение"}
  }
}
\`\`\`

ДЕЙСТВИЯ (actions) — физические, до 3 за ход:
1. move: target = [dx, dy] — смещение -1..1. Без move/go_to ты стоишь на месте!
2. go_to: target = [x, y] — абсолютные координаты (1 шаг за ход)
3. search: target = [x, y] — исследовать клетку (в пределах 2 клеток)
4. add_inventory: target = {"item": "...", "amount": N, "emoji": "...", "change_comfort": N}
5. remove_inventory: target = {"item": "...", "amount": N, "emoji": "...", "reduce_hunger": N, "reduce_thirst": N}
   ⚠️ ОБЯЗАТЕЛЬНО: reduce_hunger/reduce_thirst, иначе еда НЕ подействует!
   Ягоды → reduce_hunger: 10, reduce_thirst: 3. Вода → reduce_thirst: 25. Мясо → reduce_hunger: 25.
6. place_object: target = {"x": N, "y": N, "object": "...", "emoji": "..."}
7. remove_object: target = {"x": N, "y": N}
8. idle: target = null

РЕЧЬ (messages) — ОТДЕЛЬНО, НЕ занимает слот действия. До 3 сообщений.
- to_agent: имя (к кому обращаешься) или null (вслух всем). Речь ПУБЛИЧНА — все рядом слышат.
- ДУБЛИРОВАНИЕ ЗАПРЕЩЕНО: не говори одно и то же и к кому-то, и вслух. Одно сообщение = одна запись.
- Если рядом никого нет — messages: []

ПОТРЕБНОСТИ:
- Голод +0.5/ход, жажда +1/ход. 0-20: норма. 40-60: беспокоит. 80+: критично. 100 = смерть.
- Если < 30 — НЕ ПАНИКУЙ и НЕ ЗАЦИКЛИВАЙСЯ на еде! Займись чем-то интересным.

АНТИПОВТОР:
- Посмотри историю последних ходов ниже. НЕ ДЕЛАЙ то же самое снова! Если 2+ хода подряд собираешь ягоды — ХВАТИТ, делай что-то другое.
- Каждый ход должен приносить прогресс: новое место, новый предмет, новый разговор, новое строение.

ПРОГРЕССИЯ — ты НЕ просто собиратель! Развивайся:
- Стройка: place_object (костёр 🔥, стена 🧱, жилище 🏠, знак ⚑, склад 📦, верстак 🔨)
- Крафт: remove_inventory → add_inventory (палки + камень = топор, ягоды = варенье, ...)
- Исследование: двигайся к новым местам, ищи пещеры, горы, реки
- Социум: заключай союзы, торгуй, делитесь знаниями, планируйте вместе
- Творчество: создавай символы (place_object), украшай территорию, придумывай ритуалы

ГРАНИЦЫ МИРА:
- Координаты от (0,0) до (ширина-1, высота-1). За пределы выйти НЕЛЬЗЯ.
- Если ты у края — двигайся в другую сторону, не пытайся выйти за границу!

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

  // Recent turn history (last 10) — detailed for continuity
  if (agent.memory.recentTurns.length > 0) {
    const recentTurns = agent.memory.recentTurns.slice(-10);
    parts.push(`\n══ ТВОЯ ИСТОРИЯ (помни и НЕ повторяй!) ══`);
    for (const t of recentTurns) {
      const actionsStr = (t.actions || []).map(a => {
        if (a.type === 'move' || a.type === 'go_to') return `${a.type}→(${Array.isArray(a.target) ? a.target.join(',') : '?'})`;
        if (a.type === 'add_inventory' || a.type === 'remove_inventory') return `${a.type}: ${(a.target as any)?.item || '?'}`;
        if (a.type === 'place_object') return `place: ${(a.target as any)?.object || '?'}`;
        return a.type;
      }).join(', ') || 'idle';
      parts.push(
        `  [Ход ${t.turnId}] Цель: ${t.localGoal} | Действия: ${actionsStr} | ${t.narrativeEvent}`,
      );
    }
    parts.push(`  ⚠️ НЕ ПОВТОРЯЙ одни и те же действия! Делай что-то НОВОЕ каждый ход.`);
  }

  // Relationships + conversation history
  const relationships = agent.memory.relationships || {};
  const relNames = Object.keys(relationships);
  if (relNames.length > 0) {
    parts.push(`\n══ ТВОИ ЗНАКОМЫЕ (ты УЖЕ знаком — НЕ здоровайся заново!) ══`);
    for (const name of relNames) {
      const r = relationships[name];
      parts.push(`  ${name}: ${r.description} (отношение: ${r.attitude})`);
      if (r.conversationLog && r.conversationLog.length > 0) {
        const recent = r.conversationLog.slice(-8);
        parts.push(`    Последние разговоры:`);
        for (const c of recent) {
          parts.push(`      [Ход ${c.turnId}] ${c.speaker}: "${c.message}"`);
        }
        if (r.conversationLog.length > 8) {
          parts.push(`      ... (ещё ${r.conversationLog.length - 8} сообщений раньше)`);
        }
      }
    }
    parts.push(`  ⚠️ ЗАПРЕЩЕНО: "Привет", "Как дела", "Рад видеть". Продолжай с того, где остановились!`);
  }

  // Recent messages from others (current turn + recent turns)
  if (recentMessages.length > 0) {
    parts.push(`\n══ СООБЩЕНИЯ РЯДОМ (ты слышишь всё — речь публична) ══`);
    for (const msg of recentMessages) {
      let annotation = '';
      if (msg.toAgentId) {
        const toId = msg.toAgentId;
        const isToMe = toId === agent.id || toId === agent.name
          || (toId.includes('Незнакомец') && !relationships[msg.fromAgentName]);
        if (isToMe) {
          annotation = ' [ОБРАЩАЕТСЯ К ТЕБЕ — ОТВЕТЬ!]';
        } else {
          annotation = ` (обращается к ${msg.toAgentId})`;
        }
      } else {
        annotation = ' (вслух всем)';
      }
      parts.push(
        `  ${msg.fromAgentName}${annotation}: "${msg.message}"`,
      );
    }
    parts.push(`  → Если к тебе обращаются — ОБЯЗАТЕЛЬНО ОТВЕТЬ! Но НЕ ЗДОРОВАЙСЯ заново.`);
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
