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

// ==================== Retry Helpers ====================

function isRetryableError(error: any): boolean {
  if (!error) return false;
  const message = error.message || String(error);
  // Rate limit (429), server errors (5xx), network failures
  if (message.includes('429') || message.includes('rate limit') || message.includes('Rate limit')) return true;
  if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) return true;
  if (message.includes('fetch failed') || message.includes('network') || message.includes('ECONNRESET') || message.includes('ETIMEDOUT')) return true;
  if (message.includes('timeout') || message.includes('Timeout')) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

// ==================== Single Provider Call ====================

async function callProvider(
  model: LLMModel,
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  provider: LLMProvider,
): Promise<LLMAgentResponse> {
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
}

// ==================== Unified Entry Point ====================

export interface LLMCallResult {
  response: LLMAgentResponse;
  success: boolean;        // true if LLM actually responded, false if fallback was used
  error?: string;          // error message if failed
  retriesUsed: number;     // how many retries were attempted
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000; // 2s, 4s, 8s

export async function callLLM(
  model: LLMModel,
  systemPrompt: string,
  userPrompt: string,
  apiKeys: ApiKeys
): Promise<LLMAgentResponse> {
  const result = await callLLMWithStatus(model, systemPrompt, userPrompt, apiKeys);
  return result.response;
}

export async function callLLMWithStatus(
  model: LLMModel,
  systemPrompt: string,
  userPrompt: string,
  apiKeys: ApiKeys
): Promise<LLMCallResult> {
  const apiKey = getApiKeyForModel(model, apiKeys);
  const provider = getProviderForModel(model);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await callProvider(model, systemPrompt, userPrompt, apiKey, provider);
      return {
        response,
        success: true,
        retriesUsed: attempt,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`LLM call attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for ${model}:`, lastError.message);

      // Only retry for retryable errors, and not on the last attempt
      if (attempt < MAX_RETRIES && isRetryableError(lastError)) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`Retrying in ${delayMs}ms...`);
        await sleep(delayMs);
      } else if (!isRetryableError(lastError)) {
        // Non-retryable error (e.g. invalid API key, bad request) - break immediately
        break;
      }
    }
  }

  const errorMsg = lastError?.message || 'Unknown error';
  console.error(`All LLM call attempts failed for model ${model}: ${errorMsg}`);

  // Return a graceful fallback response so the simulation can continue
  return {
    response: {
      goal: '',
      local_goal: 'оправиться от замешательства',
      thought: `Ошибка вызова LLM: ${errorMsg}`,
      actions: [{ type: 'idle', target: null }],
      narrative_event: 'На мгновение замер, не в силах собраться с мыслями.',
      inventory_report: 'без изменений',
    },
    success: false,
    error: errorMsg,
    retriesUsed: MAX_RETRIES,
  };
}
