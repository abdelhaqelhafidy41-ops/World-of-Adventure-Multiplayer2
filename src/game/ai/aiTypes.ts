import type { Language } from '../i18n/translations';
import type { NpcRole, NpcRoutinePeriod } from '../types';

export type AIAvailabilityStatus =
  | 'unknown'
  | 'available'
  | 'unavailable'
  | 'disabled';

export interface AINpcContext {
  npcId: string;
  name: string;
  role: NpcRole;
  title: string;
  location: string;
  personality: string;
  routineLabel: string;
  routinePeriod: NpcRoutinePeriod;
}

export interface AIWorldContext {
  biome: string;
  timeOfDay: string;
  weather: string;
  playerLevel: number;
  activeQuests: string[];
  completedQuests: string[];
}

export interface NpcChatTurn {
  id: string;
  role: 'player' | 'npc';
  text: string;
  timestamp: number;
  source: 'gemini' | 'fallback';
  lang: Language;
}

export interface AIProviderRequest {
  npc: AINpcContext;
  playerMessage: string;
  history: Array<{ role: 'player' | 'npc'; text: string }>;
  worldContext: AIWorldContext;
  language: Language;
}

export interface AIProviderResponse {
  ok: boolean;
  reply?: string;
  available?: boolean;
  reason?: string;
}

export interface IAIProvider {
  readonly name: string;
  checkStatus(): Promise<{ available: boolean }>;
  generateNpcReply(request: AIProviderRequest): Promise<AIProviderResponse>;
}
