import { NextResponse } from 'next/server';
import type { TurnRecord, AgentState, ApiKeys, LLMModel } from '@/types';
import { getProviderForModel } from '@/types';
import { callLLM } from '@/lib/llm/providers';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { turnCount, turnHistory, agents, apiKeys, model: requestedModel } = body as {
      turnCount: number;
      turnHistory: TurnRecord[];
      agents: AgentState[];
      apiKeys: ApiKeys;
      model?: LLMModel;
    };

    if (!turnHistory || turnHistory.length === 0) {
      return NextResponse.json({ success: false, error: 'Нет истории ходов' }, { status: 400 });
    }

    // Get the last N turns
    const relevantTurns = turnHistory.slice(-turnCount);

    // Build agent name lookup
    const agentMap = new Map<string, AgentState>();
    for (const agent of agents) {
      agentMap.set(agent.id, agent);
    }

    // Build a detailed description of each turn
    const turnDescriptions = relevantTurns.map((turn) => {
      const lines: string[] = [];
      lines.push(`=== Ход ${turn.turnId} ===`);

      for (const [agentId, data] of Object.entries(turn.agentTurns)) {
        const agent = agentMap.get(agentId);
        const name = agent?.name || agentId;
        lines.push(`  ${name}:`);
        lines.push(`    Мысль: ${data.thought}`);
        lines.push(`    Задача: ${data.localGoal}`);
        if (data.actions.length > 0) {
          const actionStrs = data.actions.map((a) => {
            if (a.type === 'move') return `движение`;
            if (a.type === 'go_to') return `идти к (${(a.target as any)?.x ?? (a.target as any)?.[0]}, ${(a.target as any)?.y ?? (a.target as any)?.[1]})`;
            if (a.type === 'search') return `поиск`;
            if (a.type === 'add_inventory') return `взял ${(a.target as any)?.item}`;
            if (a.type === 'remove_inventory') return `использовал ${(a.target as any)?.item}`;
            if (a.type === 'communicate') return `сказал: "${(a.target as any)?.message}"`;
            return a.type;
          });
          lines.push(`    Действия: ${actionStrs.join('; ')}`);
        }
        lines.push(`    Событие: ${data.narrativeEvent}`);
        lines.push(`    Позиция: (${data.position.x}, ${data.position.y}), Голод: ${data.needs.hunger}, Жажда: ${data.needs.thirst}, Комфорт: ${data.needs.comfort}`);
      }

      if (turn.messages.length > 0) {
        lines.push(`  Сообщения:`);
        for (const msg of turn.messages) {
          lines.push(`    ${msg.fromAgentName}${msg.toAgentId ? ` → ${msg.toAgentId}` : ''}: ${msg.message}`);
        }
      }

      if (turn.worldEvents.length > 0) {
        lines.push(`  Мировые события: ${turn.worldEvents.join('; ')}`);
      }

      return lines.join('\n');
    }).join('\n\n');

    // Use requested model if provided and its provider has a key; otherwise auto-select
    let summaryModel: LLMModel = 'gpt-4o-mini';
    if (requestedModel) {
      const provider = getProviderForModel(requestedModel);
      if (apiKeys[provider]) {
        summaryModel = requestedModel;
      }
    } else {
      if (apiKeys.anthropic) summaryModel = 'claude-haiku-4-20250414';
      else if (apiKeys.openai) summaryModel = 'gpt-4o-mini';
      else if (apiKeys.deepseek) summaryModel = 'deepseek-chat';
      else if (apiKeys.gemini) summaryModel = 'gemini-2.0-flash';
    }

    const systemPrompt = `Ты — рассказчик и хронист мира симуляции жизни. Твоя задача — написать увлекательное и подробное описание событий, которые произошли за указанный период. Пиши ТОЛЬКО на русском языке. Пиши в стиле художественного повествования, как хроникёр, наблюдающий за жизнью обитателей мира. Упоминай имена персонажей, их действия, взаимоотношения, решения и ключевые события. Не используй слова "агент", "ИИ", "программа" — называй их по именам или "обитатели", "существа", "путники".`;

    const userPrompt = `Напиши подробное и художественное саммари событий за последние ${relevantTurns.length} ходов (ходы ${relevantTurns[0]?.turnId} — ${relevantTurns[relevantTurns.length - 1]?.turnId}).

Персонажи мира:
${agents.map((a) => `- ${a.emoji} ${a.name}: ${a.backstory}`).join('\n')}

Вот что произошло:

${turnDescriptions}

Напиши живое, эмоциональное повествование о том, что произошло. Отметь ключевые моменты: встречи персонажей, важные решения, опасные ситуации, крафт, общение. Длина: 3-6 абзацев.`;

    const response = await callLLM(summaryModel, systemPrompt, userPrompt, apiKeys);

    // Extract the summary text
    const summaryText = (response as any).summary
      || response.narrative_event
      || response.thought
      || JSON.stringify(response);

    return NextResponse.json({ success: true, summary: summaryText });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
