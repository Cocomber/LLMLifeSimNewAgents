// ==================== Core Types ====================

export interface Position {
  x: number;
  y: number;
}

export interface WorldObject {
  id: string;
  type: string;
  emoji: string;
  position: Position;
  properties?: Record<string, any>;
  placedByAgent?: string;
}

export interface InventoryItem {
  name: string;
  emoji: string;
  amount: number;
  properties?: Record<string, any>;
}

export interface AgentNeeds {
  hunger: number;   // 0-100, higher = more hungry
  thirst: number;   // 0-100, higher = more thirsty
  comfort: number;  // 0-100, higher = more comfortable
}

// ==================== Memory ====================

export interface MemoryEvent {
  turnId: number;
  event: string;
  important: boolean;
}

export interface ConversationEntry {
  turnId: number;
  speaker: string; // name of who said it
  message: string;
}

export interface AgentRelationship {
  name: string;
  description: string;
  attitude: string;
  lastSeenTurn: number;
  conversationLog: ConversationEntry[]; // full conversation history with this entity
}

export interface AgentMemory {
  importantEvents: MemoryEvent[];
  recentTurns: TurnLog[];
  summaries: string[];
  relationships: Record<string, AgentRelationship>; // keyed by agent name
}

export interface TurnLog {
  turnId: number;
  agentId: string;
  thought: string;
  action: AgentAction;
  narrativeEvent: string;
  needs: AgentNeeds;
  position: Position;
  localGoal: string;
  globalGoal: string;
}

// ==================== Agent ====================

export type LLMModel = 'gpt-4o' | 'gpt-4o-mini' | 'deepseek-chat' | 'deepseek-reasoner' | 'gemini-2.0-flash' | 'gemini-2.5-pro-preview-05-06' | 'claude-sonnet-4-20250514' | 'claude-haiku-4-20250414';

export const LLM_MODEL_LABELS: Record<LLMModel, string> = {
  'gpt-4o': 'ChatGPT (GPT-4o)',
  'gpt-4o-mini': 'ChatGPT (GPT-4o-mini)',
  'deepseek-chat': 'DeepSeek Chat',
  'deepseek-reasoner': 'DeepSeek Reasoner',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gemini-2.5-pro-preview-05-06': 'Gemini 2.5 Pro',
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-haiku-4-20250414': 'Claude Haiku 4',
};

export type LLMProvider = 'openai' | 'deepseek' | 'gemini' | 'anthropic';

export function getProviderForModel(model: LLMModel): LLMProvider {
  if (model.startsWith('gpt-')) return 'openai';
  if (model.startsWith('deepseek-')) return 'deepseek';
  if (model.startsWith('gemini-')) return 'gemini';
  if (model.startsWith('claude-')) return 'anthropic';
  return 'openai';
}

export const AGENT_EMOJIS = ['🟦', '🟥', '🟩', '🟨'];
export const AGENT_COLORS = ['#3B82F6', '#EF4444', '#22C55E', '#EAB308'];

export interface AgentConfig {
  id: string;
  model: LLMModel;
  globalGoal: string;
  emoji: string;
  color: string;
  // Optional user-defined overrides (skip LLM init if name is provided)
  customName?: string;
  customAge?: number;
  customBackstory?: string;
}

export interface AgentState {
  id: string;
  name: string;
  backstory: string;
  emoji: string;
  color: string;
  position: Position;
  needs: AgentNeeds;
  inventory: InventoryItem[];
  globalGoal: string;
  localGoal: string;
  model: LLMModel;
  memory: AgentMemory;
  alive: boolean;
  // Health tracking
  errorCount?: number;       // consecutive LLM call failures
  lastError?: string;        // last error message
  lastErrorTurn?: number;    // turn when last error occurred
  paused?: boolean;          // user paused this agent
}

// ==================== Actions ====================

export interface MoveAction {
  type: 'move';
  target: [number, number]; // dx, dy
}

export interface GoToAction {
  type: 'go_to';
  target: [number, number]; // absolute x, y
}

export interface SearchAction {
  type: 'search';
  target: [number, number]; // x, y to search
}

export interface AddInventoryAction {
  type: 'add_inventory';
  target: {
    item: string;
    amount: number;
    emoji: string;
    change_comfort?: number;
  };
}

export interface RemoveInventoryAction {
  type: 'remove_inventory';
  target: {
    item: string;
    amount: number;
    emoji: string;
    reduce_hunger?: number;
    reduce_thirst?: number;
  };
}

export interface PlaceObjectAction {
  type: 'place_object';
  target: {
    x: number;
    y: number;
    object: string;
    emoji: string;
  };
}

export interface RemoveObjectAction {
  type: 'remove_object';
  target: {
    x: number;
    y: number;
    object_id?: string;
  };
}

export interface CommunicateAction {
  type: 'communicate';
  target: {
    message: string;
    to_agent?: string; // null = broadcast to nearby
  };
}

export interface IdleAction {
  type: 'idle';
  target?: null;
}

export type AgentAction =
  | MoveAction
  | GoToAction
  | SearchAction
  | AddInventoryAction
  | RemoveInventoryAction
  | PlaceObjectAction
  | RemoveObjectAction
  | CommunicateAction
  | IdleAction;

// ==================== LLM Response ====================

export interface LLMAgentResponse {
  goal: string;
  local_goal: string;
  thought: string;
  actions: Array<{
    type: string;
    target: any;
  }>;
  messages?: Array<{
    message: string;
    to_agent?: string;
  }>;
  narrative_event: string;
  inventory_report: string;
  message_to_others?: string;
  relationships_update?: Record<string, {
    description: string;
    attitude: string;
  }>;
}

// ==================== Communication ====================

export type CommunicationMode = 'speech' | 'signals' | 'custom_language' | 'none';

export interface ChatMessage {
  turnId: number;
  fromAgentId: string;
  fromAgentName: string;
  toAgentId?: string;
  message: string;
  position: Position;
}

// ==================== Game State ====================

export interface WorldState {
  width: number;
  height: number;
  objects: WorldObject[];
}

export interface TurnRecord {
  turnId: number;
  timestamp: string;
  agentTurns: Record<string, {
    needs: AgentNeeds;
    position: Position;
    inventory: InventoryItem[];
    thought: string;
    actions: AgentAction[];
    narrativeEvent: string;
    globalGoal: string;
    localGoal: string;
  }>;
  worldSnapshot: WorldObject[];
  messages: ChatMessage[];
  worldEvents: string[];
}

export interface GameSettings {
  communicationMode: CommunicationMode;
  visibilityRange: number;
  needsDecayRate: {
    hunger: number;
    thirst: number;
    comfort: number;
  };
}

export interface ApiKeys {
  openai?: string;
  deepseek?: string;
  gemini?: string;
  anthropic?: string;
}

export interface GameState {
  id: string;
  currentTurn: number;
  world: WorldState;
  agents: AgentState[];
  turnHistory: TurnRecord[];
  settings: GameSettings;
  apiKeys: ApiKeys;
  agentConfigs: AgentConfig[];
  createdAt: string;
  globalWorldEvents: string[];
}

// ==================== Save/Load ====================

export interface SaveFile {
  version: string;
  gameState: GameState;
  savedAt: string;
}

export interface SaveMeta {
  id: string;
  name: string;
  turn: number;
  agentCount: number;
  savedAt: string;
}
