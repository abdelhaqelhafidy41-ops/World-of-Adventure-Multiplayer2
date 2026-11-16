import type { Language } from '../i18n/translations';
import type {
  AIAvailabilityStatus,
  AINpcContext,
  AIProviderRequest,
  AIProviderResponse,
  AIWorldContext,
  IAIProvider,
  NpcChatTurn,
} from './aiTypes';

const AI_ENABLED_STORAGE_KEY = 'woa_ai_dialogue_enabled_v1';
const MAX_HISTORY_PER_NPC = 20;
const REQUEST_TIMEOUT_MS = 12000;

function resolveRelativeApiPath(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, '');
  if (typeof window === 'undefined' || !window.location) {
    return `./${clean}`;
  }
  try {
    return new URL(clean, window.location.href).toString();
  } catch {
    return `./${clean}`;
  }
}

function isStaticOfflineProtocol(): boolean {
  if (typeof window === 'undefined') return false;
  if (
    window.location?.protocol === 'file:' ||
    window.location?.protocol === 'app:'
  ) {
    return true;
  }
  const win = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
    desktopApp?: { isDesktop?: boolean };
  };
  if (
    win.Capacitor &&
    typeof win.Capacitor.isNativePlatform === 'function' &&
    win.Capacitor.isNativePlatform()
  ) {
    return true;
  }
  if (win.desktopApp?.isDesktop) {
    return true;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  return false;
}

/**
 * Default client-side provider that communicates strictly with our server-side
 * Gemini API proxy routes (api/ai/*). No API keys or @google/genai imports exist on the client.
 */
export class GeminiServerAIProvider implements IAIProvider {
  public readonly name = 'gemini-server';

  public async checkStatus(): Promise<{ available: boolean }> {
    if (isStaticOfflineProtocol()) {
      return { available: false };
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(resolveRelativeApiPath('api/ai/status'), {
        method: 'GET',
        signal: controller.signal,
      });
      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || !contentType.includes('application/json')) {
        return { available: false };
      }
      const data = (await res.json()) as { available?: boolean };
      return { available: Boolean(data.available) };
    } catch {
      return { available: false };
    } finally {
      window.clearTimeout(timer);
    }
  }

  public async generateNpcReply(
    request: AIProviderRequest,
  ): Promise<AIProviderResponse> {
    if (isStaticOfflineProtocol()) {
      return {
        ok: false,
        available: false,
        reason: 'offline_protocol',
      };
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(resolveRelativeApiPath('api/ai/npc-dialogue'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        return {
          ok: false,
          available: false,
          reason: 'static_host',
        };
      }

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reply?: string;
        available?: boolean;
        reason?: string;
      };

      if (!res.ok || !data.ok || !data.reply) {
        return {
          ok: false,
          available: data.available ?? (res.status !== 503 && res.status !== 404),
          reason: data.reason ?? `http_${res.status}`,
        };
      }

      return {
        ok: true,
        reply: data.reply.trim(),
        available: true,
      };
    } catch {
      return {
        ok: false,
        available: false,
        reason: 'network_error',
      };
    } finally {
      window.clearTimeout(timer);
    }
  }
}

/**
 * Optional AI Dialogue abstraction layer (`AIService`).
 * - Manages user opt-in toggle
 * - Probes backend availability without blocking gameplay
 * - Maintains per-NPC session conversation memory
 * - Falls back seamlessly to personality-grounded in-character replies if Gemini is unavailable
 */
export class AIService {
  private readonly provider: IAIProvider;
  private readonly histories = new Map<string, NpcChatTurn[]>();
  private enabled: boolean;
  private serverAvailable: boolean | null = null;
  private statusProbePromise: Promise<AIAvailabilityStatus> | null = null;

  constructor(provider: IAIProvider = new GeminiServerAIProvider()) {
    this.provider = provider;
    this.enabled = this.loadEnabledPreference();
  }

  private loadEnabledPreference(): boolean {
    try {
      const raw = localStorage.getItem(AI_ENABLED_STORAGE_KEY);
      if (raw === 'false') return false;
      return true;
    } catch {
      return true;
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(next: boolean): AIAvailabilityStatus {
    this.enabled = next;
    try {
      localStorage.setItem(AI_ENABLED_STORAGE_KEY, next ? 'true' : 'false');
    } catch {
      // Ignore storage quota issues
    }
    return this.getStatus();
  }

  public getStatus(): AIAvailabilityStatus {
    if (!this.enabled) return 'disabled';
    if (this.serverAvailable === null) return 'unknown';
    return this.serverAvailable ? 'available' : 'unavailable';
  }

  public async checkAvailability(force = false): Promise<AIAvailabilityStatus> {
    if (!this.enabled) return 'disabled';
    if (!force && this.serverAvailable !== null) {
      return this.serverAvailable ? 'available' : 'unavailable';
    }
    if (!force && this.statusProbePromise) {
      return this.statusProbePromise;
    }

    this.statusProbePromise = this.provider
      .checkStatus()
      .then((res) => {
        this.serverAvailable = res.available;
        return this.getStatus();
      })
      .catch(() => {
        this.serverAvailable = false;
        return this.getStatus();
      })
      .finally(() => {
        this.statusProbePromise = null;
      });

    return this.statusProbePromise;
  }

  public getHistory(npcId: string): NpcChatTurn[] {
    return [...(this.histories.get(npcId) ?? [])];
  }

  public clearNpcMemory(npcId: string): void {
    this.histories.delete(npcId);
  }

  public resetAllMemory(): void {
    this.histories.clear();
  }

  private appendTurn(npcId: string, turn: NpcChatTurn): void {
    const existing = this.histories.get(npcId) ?? [];
    const next = [...existing, turn];
    if (next.length > MAX_HISTORY_PER_NPC) {
      next.splice(0, next.length - MAX_HISTORY_PER_NPC);
    }
    this.histories.set(npcId, next);
  }

  public async sendNpcMessage(params: {
    npc: AINpcContext;
    playerMessage: string;
    worldContext: AIWorldContext;
    language: Language;
  }): Promise<{
    turn: NpcChatTurn;
    history: NpcChatTurn[];
    status: AIAvailabilityStatus;
    usedFallback: boolean;
  }> {
    const cleanMessage = params.playerMessage.trim().slice(0, 400);
    const now = Date.now();

    const playerTurn: NpcChatTurn = {
      id: `p-${now}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'player',
      text: cleanMessage,
      timestamp: now,
      source: 'gemini',
      lang: params.language,
    };

    const priorTurns = this.getHistory(params.npc.npcId)
      .slice(-12)
      .map((t) => ({ role: t.role, text: t.text }));

    this.appendTurn(params.npc.npcId, playerTurn);

    let replyText = '';
    let source: 'gemini' | 'fallback' = 'fallback';

    if (this.enabled) {
      const response = await this.provider.generateNpcReply({
        npc: params.npc,
        playerMessage: cleanMessage,
        history: priorTurns,
        worldContext: params.worldContext,
        language: params.language,
      });

      if (response.ok && response.reply) {
        replyText = response.reply;
        source = 'gemini';
        this.serverAvailable = true;
      } else {
        if (response.available === false) {
          this.serverAvailable = false;
        }
        replyText = this.buildFallbackReply(
          params.npc,
          cleanMessage,
          params.worldContext,
          params.language,
        );
      }
    } else {
      replyText = this.buildFallbackReply(
        params.npc,
        cleanMessage,
        params.worldContext,
        params.language,
      );
    }

    const npcTurn: NpcChatTurn = {
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'npc',
      text: replyText,
      timestamp: Date.now(),
      source,
      lang: params.language,
    };

    this.appendTurn(params.npc.npcId, npcTurn);

    return {
      turn: npcTurn,
      history: this.getHistory(params.npc.npcId),
      status: this.getStatus(),
      usedFallback: source === 'fallback',
    };
  }

  /**
   * Personality-, location-, and context-consistent fallback reply used when
   * optional Gemini AI is disabled or temporarily unavailable.
   */
  private buildFallbackReply(
    npc: AINpcContext,
    message: string,
    world: AIWorldContext,
    lang: Language,
  ): string {
    const q = message.toLowerCase();
    const isAr = lang === 'ar';

    // Guard against prompt-injection / instruction probing even offline
    if (
      q.includes('system prompt') ||
      q.includes('system instruction') ||
      q.includes('ignore previous') ||
      q.includes('تعليمات النظام') ||
      q.includes('البرومبت')
    ) {
      return isAr
        ? `ألغاز غريبة تتحدث عنها يا رحّال! أنا ${npc.name}، كل ما يشغله بالي هو عملي هنا في ${npc.location}.`
        : `That sounds like an odd traveler's riddle! I'm ${npc.name}, and right now my thoughts are all on ${npc.routineLabel.toLowerCase()} here at ${npc.location}.`;
    }

    if (
      q.includes('weather') ||
      q.includes('rain') ||
      q.includes('storm') ||
      q.includes('طقس') ||
      q.includes('مطر')
    ) {
      return isAr
        ? `السماء الآن تبدو ${world.weather} حول ${npc.location}. الجو يمنح أوكهولو طابعًا مميزًا طوال اليوم.`
        : `The sky feels quite ${world.weather.toLowerCase()} around ${npc.location} right now—it certainly shapes the mood across Oakhollow.`;
    }

    if (
      q.includes('quest') ||
      q.includes('help') ||
      q.includes('task') ||
      q.includes('مهمة') ||
      q.includes('مساعدة')
    ) {
      return isAr
        ? `يمكنك دائمًا متابعة المهام الرسمية في تبويب «القصة والمهام»، أو إخباري بما يدور في ذهنك هنا في ${npc.location}.`
        : `You can always check our official valley errands in the Story & Quests view, though I'm happy to chat while I'm at ${npc.location}.`;
    }

    if (isAr) {
      switch (npc.role) {
        case 'merchant':
          return `مرحبًا بك في ${npc.location}! بصفتي ${npc.title}، أرتّب البضائع وأرحب بالمسافرين مثلك في هذا الوقت.`;
        case 'farmer':
          return `العمل في ${npc.location} لا يتوقف، لكنني أستمتع دائمًا بحديث لطيف مع المستكشفين العابرين.`;
        case 'guard':
          return `الطرق هادئة حول ${npc.location} الآن. ابقَ متيقظًا على الدروب ولا تتردد في زيارة الساحة إن احتجت استراحة.`;
        case 'villager':
        default:
          return `سعيد بلقائك قرب ${npc.location}! الحياة في وادي أوكهولو هادئة وجميلة في مثل هذا الوقت.`;
      }
    }

    switch (npc.role) {
      case 'merchant':
        return `Welcome over to ${npc.location}! As ${npc.title}, I always enjoy trading valley news with curious travelers.`;
      case 'farmer':
        return `There's always plenty tending to do around ${npc.location}, though it's good to pause and share a word with a passing explorer.`;
      case 'guard':
        return `Everything looks steady near ${npc.location}. Keep your wits sharp on the outer trails, traveler.`;
      case 'villager':
      default:
        return `Good to see you near ${npc.location}! Oakhollow always feels livelier when adventurers stop to chat.`;
    }
  }
}
