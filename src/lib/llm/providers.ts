import {
  LLMModel,
  LLMProvider,
  ApiKeys,
  LLMAgentResponse,
  getProviderForModel,
} from '@/types';

// ==================== Response Parsing ====================

export function parseLLMResponse(text: string): LLMAgentResponse {
  // 1. Try direct JSON.parse
  try {
    const parsed = JSON.parse(text);
    return parsed as LLMAgentResponse;
  } catch {
    // continue to next strategy
  }

  // 2. Try to find JSON block in markdown code fences
  const codeFenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeFenceMatch) {
    try {
      const parsed = JSON.parse(codeFenceMatch[1].trim());
      return parsed as LLMAgentResponse;
    } catch {
      // continue to next strategy
    }
  }

  // 3. Try to find first { and last } and parse that substring
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      const jsonCandidate = text.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonCandidate);
      return parsed as LLMAgentResponse;
    } catch {
      // continue to fallback
    }
  }

  // 4. Fallback: return a default idle response with the raw text as thought
  return {
    goal: '',
    local_goal: 'разобраться что делать',
    thought: text.slice(0, 500),
    actions: [{ type: 'idle', target: null }],
    narrative_event: 'Стоял в замешательстве, не понимая что происходит.',
    inventory_report: 'без изменений',
  };
}

// ==================== API Key Helper ====================

function getApiKeyForModel(model: LLMModel, apiKeys: ApiKeys): string {
  const provider: LLMProvider = getProviderForModel(model);
  const key = apiKeys[provider];
  if (!key) {
    throw new Error(`No API key configured for provider "${provider}" (model: ${model})`);
  }
  return key;
}

// ==================== Provider Implementations ====================

async function callOpenAI(
  model: LLMModel,
  systemPrompt: string,
  userPrompt: string,
  apiKey: string
): Promise<LLMAgentResponse> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  return parseLLMResponse(text);
}

async function callDeepSeek(
  model: LLMModel,
  systemPrompt: string,
  userPrompt: string,
  apiKey: string
): Promise<LLMAgentResponse> {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`DeepSeek API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  return parseLLMResponse(text);
}

async function callGemini(
  model: LLMModel,
  systemPrompt: string,
  userPrompt: string,
  apiKey: string
): Promise<LLMAgentResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 2000,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return parseLLMResponse(text);
}

async function callAnthropic(
  model: LLMModel,
  systemPrompt: string,
  userPrompt: string,
  apiKey: string
): Promise<LLMAgentResponse> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? '';
  return parseLLMResponse(text);
}

// ==================== Unified Entry Point ====================

export async function callLLM(
  model: LLMModel,
  systemPrompt: string,
  userPrompt: string,
  apiKeys: ApiKeys
): Promise<LLMAgentResponse> {
  const apiKey = getApiKeyForModel(model, apiKeys);
  const provider = getProviderForModel(model);

  try {
    switch (provider) {
      case 'openai':
        return await callOpenAI(model, systemPrompt, userPrompt, apiKey);
      case 'deepseek':
        return await callDeepSeek(model, systemPrompt, userPrompt, apiKey);
      case 'gemini':
        return await callGemini(model, systemPrompt, userPrompt, apiKey);
      case 'anthropic':
        return await callAnthropic(model, systemPrompt, userPrompt, apiKey);
      default:
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  } catch (error) {
    console.error(`LLM call failed for model ${model}:`, error);

    // Return a graceful fallback response so the simulation can continue
    return {
      goal: '',
      local_goal: 'оправиться от замешательства',
      thought: `Ошибка вызова LLM: ${error instanceof Error ? error.message : String(error)}`,
      actions: [{ type: 'idle', target: null }],
      narrative_event: 'На мгновение замер, не в силах собраться с мыслями.',
      inventory_report: 'без изменений',
    };
  }
}
