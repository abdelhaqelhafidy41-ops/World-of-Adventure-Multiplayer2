import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  MessageSquare,
  RotateCcw,
  ScrollText,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  DialogueChoiceNode,
  DialogueSnapshot,
  QuestStatus,
} from '../game/dialogue/dialogueTypes';
import type { NpcRole } from '../game/types';
import {
  PERIOD_LABELS,
  ROLE_LABELS,
  UI_TEXT,
  type Language,
} from '../game/i18n/translations';
import type { AIService } from '../game/ai/AIService';
import type {
  AIAvailabilityStatus,
  AIWorldContext,
  NpcChatTurn,
} from '../game/ai/aiTypes';

interface DialogueModalProps {
  snapshot: DialogueSnapshot;
  lang: Language;
  aiService?: AIService | null;
  getAiWorldContext?: () => AIWorldContext;
  onNext: () => void;
  onSelectChoice: (choiceId: string) => void;
  onClose: () => void;
}

const ROLE_COLOR_CLASSES: Record<NpcRole, string> = {
  villager: 'bg-[#213a2a] text-[#9be0a1] border-[#385e46]',
  merchant: 'bg-[#3c2d16] text-[#f5c76b] border-[#6b4f24]',
  farmer: 'bg-[#2b371b] text-[#c7e07e] border-[#4d622e]',
  guard: 'bg-[#1e2d3f] text-[#98c1f0] border-[#354f6e]',
  blacksmith: 'bg-[#3b251c] text-[#f3a871] border-[#6d4231]',
  hunter: 'bg-[#1c3426] text-[#84d9a6] border-[#305e42]',
  woodcutter: 'bg-[#342a1b] text-[#dfc07e] border-[#5e4a2b]',
  fisherman: 'bg-[#1a333b] text-[#7dd5eb] border-[#2e5a68]',
  healer: 'bg-[#203832] text-[#8ee6cf] border-[#366156]',
  innkeeper: 'bg-[#3a281d] text-[#f2be85] border-[#664532]',
  carpenter: 'bg-[#332919] text-[#e5be73] border-[#594729]',
  miner: 'bg-[#282b33] text-[#c2cad9] border-[#474d5c]',
  elder: 'bg-[#31263d] text-[#d4b8f5] border-[#56426b]',
  traveling_merchant: 'bg-[#3d2d14] text-[#ffd479] border-[#735324]',
};

const QUEST_STATUS_CLASSES: Record<QuestStatus, string> = {
  available: 'bg-[#3a2d15] text-[#f5c76b] border-[#6b4f24]',
  active: 'bg-[#1d303c] text-[#94ccf2] border-[#355970]',
  ready: 'bg-[#1d3b28] text-[#98eba8] border-[#376b4b]',
  completed: 'bg-[#28352c] text-[#b4c8b9] border-[#425748]',
};

export const DialogueModal: React.FC<DialogueModalProps> = ({
  snapshot,
  lang,
  aiService = null,
  getAiWorldContext,
  onNext,
  onSelectChoice,
  onClose,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';
  const roleLabel = ROLE_LABELS[lang][snapshot.npcRole];
  const roleColorClass = ROLE_COLOR_CLASSES[snapshot.npcRole];
  const periodLabel = PERIOD_LABELS[lang][snapshot.routinePeriod];

  const [selectedChoiceIdx, setSelectedChoiceIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<'story' | 'ai'>('story');
  const [aiEnabled, setAiEnabled] = useState<boolean>(
    () => aiService?.isEnabled() ?? false,
  );
  const [aiStatus, setAiStatus] = useState<AIAvailabilityStatus>(
    () => aiService?.getStatus() ?? 'disabled',
  );
  const [chatHistory, setChatHistory] = useState<NpcChatTurn[]>(
    () => aiService?.getHistory(snapshot.npcId) ?? [],
  );
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedChoiceIdx(0);
  }, [snapshot.nodeId, snapshot.lineIndex, snapshot.choices.length]);

  useEffect(() => {
    if (!aiService) return;
    setAiEnabled(aiService.isEnabled());
    setChatHistory(aiService.getHistory(snapshot.npcId));
    setAiStatus(aiService.getStatus());
    void aiService.checkAvailability().then((status) => {
      setAiStatus(status);
    });
  }, [aiService, snapshot.npcId]);

  useEffect(() => {
    if (activeTab === 'ai' && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [activeTab, chatHistory.length, isSending]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      const target = event.target as HTMLElement | null;
      const isTextInput = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable),
      );
      if (isTextInput || activeTab === 'ai') {
        return;
      }

      const hasChoices =
        !snapshot.hasMoreLines && snapshot.choices.length > 0;
      const canAdvance =
        snapshot.hasMoreLines || snapshot.canAutoAdvanceNode;

      if (event.code === 'ArrowDown' || event.code === 'KeyS') {
        if (hasChoices) {
          event.preventDefault();
          event.stopPropagation();
          setSelectedChoiceIdx((prev) => (prev + 1) % snapshot.choices.length);
        }
        return;
      }

      if (event.code === 'ArrowUp' || event.code === 'KeyW') {
        if (hasChoices) {
          event.preventDefault();
          event.stopPropagation();
          setSelectedChoiceIdx(
            (prev) => (prev - 1 + snapshot.choices.length) % snapshot.choices.length,
          );
        }
        return;
      }

      if (hasChoices && event.key >= '1' && event.key <= '9') {
        const idx = Number(event.key) - 1;
        if (idx < snapshot.choices.length) {
          event.preventDefault();
          event.stopPropagation();
          onSelectChoice(snapshot.choices[idx].id);
        }
        return;
      }

      if (
        event.code === 'Enter' ||
        event.code === 'Space' ||
        event.code === 'KeyE'
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (canAdvance) {
          onNext();
        } else if (hasChoices) {
          const picked =
            snapshot.choices[selectedChoiceIdx] ?? snapshot.choices[0];
          if (picked) {
            onSelectChoice(picked.id);
          }
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [activeTab, snapshot, selectedChoiceIdx, onNext, onSelectChoice, onClose]);

  const handleToggleAiEnabled = () => {
    if (!aiService) return;
    const next = !aiEnabled;
    setAiEnabled(next);
    const nextStatus = aiService.setEnabled(next);
    setAiStatus(nextStatus);
    if (next) {
      void aiService.checkAvailability(true).then((status) => {
        setAiStatus(status);
      });
    }
  };

  const handleClearChat = () => {
    if (!aiService) return;
    aiService.clearNpcMemory(snapshot.npcId);
    setChatHistory([]);
  };

  const handleSendAiMessage = async (overrideMessage?: string) => {
    if (!aiService || isSending) return;
    const text = (overrideMessage ?? chatInput).trim();
    if (!text) return;

    if (!overrideMessage) {
      setChatInput('');
    }
    setIsSending(true);

    const worldContext: AIWorldContext = getAiWorldContext
      ? getAiWorldContext()
      : {
          biome: 'Plains',
          timeOfDay: periodLabel,
          weather: 'clear',
          playerLevel: 1,
          activeQuests: [],
          completedQuests: [],
        };

    try {
      const result = await aiService.sendNpcMessage({
        npc: {
          npcId: snapshot.npcId,
          name: snapshot.npcName,
          role: snapshot.npcRole,
          title: snapshot.npcTitle,
          location: snapshot.npcLocation,
          personality: snapshot.npcPersonality,
          routineLabel: snapshot.routineLabel,
          routinePeriod: snapshot.routinePeriod,
        },
        playerMessage: text,
        worldContext,
        language: lang,
      });
      setChatHistory(result.history);
      setAiStatus(result.status);
    } finally {
      setIsSending(false);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  };

  const showNextButton = snapshot.hasMoreLines || snapshot.canAutoAdvanceNode;
  const showChoices = !snapshot.hasMoreLines && snapshot.choices.length > 0;
  const questBadgeClass = snapshot.questInfo
    ? QUEST_STATUS_CLASSES[snapshot.questInfo.status]
    : null;
  const questBadgeLabel = snapshot.questInfo
    ? snapshot.questInfo.status === 'available'
      ? t.questAvailableBadge
      : snapshot.questInfo.status === 'active'
        ? t.questActiveBadge
        : snapshot.questInfo.status === 'ready'
          ? t.questReadyBadge
          : t.questCompletedBadge
    : '';

  const aiStatusLabel =
    !aiEnabled || aiStatus === 'disabled'
      ? t.aiStatusDisabled
      : aiStatus === 'available'
        ? t.aiStatusAvailable
        : t.aiStatusOffline;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-[#09110d]/55 p-3 sm:p-5 mobile-hud-safe"
      role="dialog"
      aria-modal="true"
      aria-labelledby="npc-dialogue-name"
      data-testid="dialogue-modal"
    >
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="w-full max-w-xl max-h-[90dvh] flex flex-col rounded-2xl bg-[#101c16] border border-[#2d4537] p-4 sm:p-6 text-[#f1f5ee] shadow-2xl mb-1 sm:mb-0 overflow-hidden overflow-x-hidden"
      >
        {/* Header: NPC Name, Role, Title, Location, Routine */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 w-9 h-9 rounded-xl bg-[#182920] border border-[#2c4537] flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-[#e5a93c]" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="npc-dialogue-name"
                  className="font-display text-lg sm:text-xl font-bold text-[#f5f8f2]"
                >
                  {snapshot.speaker}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold tracking-wide ${roleColorClass}`}
                >
                  {roleLabel}
                </span>
              </div>
              <p className="text-xs text-[#9cb0a0] mt-0.5">{snapshot.npcTitle}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#c8d8ca]">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#7fe094] shrink-0" />
                  <span>{snapshot.npcLocation}</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#e5a93c] shrink-0" />
                  <span>
                    {snapshot.routineLabel} ({periodLabel})
                  </span>
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] rounded-lg bg-[#192a21] hover:bg-[#22392d] border border-[#2f493b] flex items-center justify-center cursor-pointer shrink-0"
            aria-label={t.closeBtn}
            data-testid="dialogue-close-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Optional Mode Switcher: Existing Branching Story & Quests vs Dynamic AI Conversation */}
        {aiService && (
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-[#22362b]">
            <div className="inline-flex items-center gap-1.5 bg-[#0c1611] border border-[#253b2f] rounded-lg p-1">
              <button
                type="button"
                onClick={() => setActiveTab('story')}
                data-testid="dialogue-tab-story"
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === 'story'
                    ? 'bg-[#e5a93c] text-[#111914]'
                    : 'text-[#bdd0be] hover:text-white'
                }`}
              >
                {t.aiTabStory}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('ai');
                  window.setTimeout(() => inputRef.current?.focus(), 40);
                }}
                data-testid="dialogue-tab-ai"
                className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'ai'
                    ? 'bg-[#223d2e] text-[#eef5ec] border border-[#3d6950]'
                    : 'text-[#bdd0be] hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-[#7fe094]" />
                <span>{t.aiTabChat}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleToggleAiEnabled}
              data-testid="ai-dialogue-toggle"
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                aiEnabled
                  ? aiStatus === 'available'
                    ? 'bg-[#193023] border-[#3a684e] text-[#9ee8ae]'
                    : 'bg-[#232b1c] border-[#4d5c37] text-[#e5c97b]'
                  : 'bg-[#18241d] border-[#2c3f34] text-[#95a898]'
              }`}
            >
              <Sparkles className="w-3 h-3 shrink-0" />
              <span>{aiEnabled ? t.aiToggleOn : t.aiToggleOff}</span>
              <span className="opacity-70">· {aiStatusLabel}</span>
            </button>
          </div>
        )}

        {/* TAB 1: Original Branching Story & Quest Dialogue */}
        {activeTab === 'story' && (
          <div className="overflow-y-auto pr-0.5">
            {snapshot.questInfo && questBadgeClass && (
              <div
                className="mb-3.5 p-3 rounded-xl bg-[#14231b] border border-[#2c4738]"
                data-testid="dialogue-quest-banner"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <div className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#f3f6ef]">
                    <ScrollText className="w-3.5 h-3.5 text-[#e5a93c]" />
                    <span>{snapshot.questInfo.title}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold tracking-wide ${questBadgeClass}`}
                  >
                    {questBadgeLabel}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-[#b7cab9]">
                  {snapshot.questInfo.progressText}
                </p>
                <p className="text-[11px] text-[#e5a93c]/90 mt-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span>
                    {t.rewardLabel} {snapshot.questInfo.rewardSummary}
                  </span>
                </p>
              </div>
            )}

            <div className="p-3.5 sm:p-4 rounded-xl bg-[#16261d] border border-[#273d30] mb-4">
              <p
                className="text-sm sm:text-base leading-relaxed text-[#f2f5ef]"
                data-testid="dialogue-line-text"
              >
                {isRtl ? `«${snapshot.currentLine}»` : `“${snapshot.currentLine}”`}
              </p>
              <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#95aa9a]">
                <span>{t.lineOf(snapshot.lineIndex + 1, snapshot.totalLines)}</span>
                {showNextButton && (
                  <span className="hidden sm:inline text-[#b8ccb9]">
                    {t.nextLineHint}
                  </span>
                )}
                {showChoices && (
                  <span className="hidden sm:inline text-[#b8ccb9]">
                    {t.chooseKeyHint(snapshot.choices.length)}
                  </span>
                )}
                {snapshot.isTerminal && (
                  <span className="hidden sm:inline text-[#b8ccb9]">
                    {t.closeKeyHint}
                  </span>
                )}
              </div>
            </div>

            {showNextButton && (
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#16251d] hover:bg-[#1f3429] border border-[#2a4234] text-xs sm:text-sm font-medium text-[#b9cbbd] cursor-pointer"
                >
                  {t.closeBtn}
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  data-testid="dialogue-next-btn"
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] active:scale-[0.98] text-[#111914] font-display font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <span>{t.nextBtn}</span>
                  {isRtl ? (
                    <ChevronLeft className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
              </div>
            )}

            {showChoices && (
              <div className="space-y-2" data-testid="dialogue-choices">
                {snapshot.choices.map((choice: DialogueChoiceNode, index: number) => {
                  const isSelected = index === selectedChoiceIdx;
                  const isQuestChoice = Boolean(choice.questTag);
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      onMouseEnter={() => setSelectedChoiceIdx(index)}
                      onClick={() => onSelectChoice(choice.id)}
                      data-testid={`dialogue-choice-${choice.id}`}
                      className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border text-start text-xs sm:text-sm font-medium transition-colors flex items-center justify-between gap-2.5 cursor-pointer ${
                        isSelected
                          ? 'bg-[#21382c] border-[#e5a93c]/75 text-[#ffffff]'
                          : 'bg-[#17281f] hover:bg-[#21382c] border-[#2b4435] text-[#edf3ea]'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#111d16] border border-[#2f493b] font-mono-num text-[11px] text-[#e5a93c] shrink-0">
                          {index + 1}
                        </span>
                        <span>{choice.label}</span>
                      </span>
                      {isQuestChoice && (
                        <span className="px-2 py-0.5 rounded-md bg-[#3c2d16] border border-[#6b4f24] text-[10px] font-semibold tracking-wide text-[#f5c76b] shrink-0">
                          {choice.questTag === 'complete'
                            ? t.questBadgeComplete
                            : t.questBadgeQuest}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {snapshot.isTerminal && (
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  data-testid="dialogue-done-btn"
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] active:scale-[0.98] text-[#111914] font-display font-bold text-xs sm:text-sm cursor-pointer"
                >
                  {t.endConversation}
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Optional Dynamic AI Conversation with Session Memory */}
        {activeTab === 'ai' && aiService && (
          <div className="flex flex-col min-h-0 flex-1" data-testid="ai-dialogue-panel">
            {!aiEnabled && (
              <div className="mb-2.5 px-3 py-2 rounded-lg bg-[#18251e] border border-[#2d4537] text-[11px] text-[#b4c7b5]">
                {t.aiDisabledNote}
              </div>
            )}
            {aiEnabled && aiStatus === 'unavailable' && (
              <div className="mb-2.5 px-3 py-2 rounded-lg bg-[#24291b] border border-[#4e5834] text-[11px] text-[#e5cf8b]">
                {t.aiOfflineNote}
              </div>
            )}

            {/* Conversation History Log */}
            <div
              ref={chatScrollRef}
              className="flex-1 min-h-[160px] max-h-[250px] overflow-y-auto rounded-xl bg-[#0d1712] border border-[#24392d] p-3 space-y-2.5 mb-3"
            >
              {chatHistory.length === 0 ? (
                <div className="text-xs text-[#9eb4a2] leading-relaxed">
                  <p>{t.aiEmptyGreeting(snapshot.npcName, snapshot.npcLocation)}</p>
                  <p className="mt-1.5 text-[11px] text-[#7c9281]">
                    {snapshot.npcPersonality}
                  </p>
                </div>
              ) : (
                chatHistory.map((turn) => {
                  const isPlayer = turn.role === 'player';
                  return (
                    <div
                      key={turn.id}
                      className={`flex flex-col ${
                        isPlayer ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div
                        className={`max-w-[88%] rounded-xl px-3 py-2 text-xs sm:text-sm leading-relaxed ${
                          isPlayer
                            ? 'bg-[#2a3f2f] border border-[#3e5e46] text-[#f5f8f2]'
                            : 'bg-[#16261d] border border-[#2b4436] text-[#e8f0e6]'
                        }`}
                      >
                        {!isPlayer && (
                          <div className="flex items-center gap-1.5 mb-0.5 text-[10px] font-semibold text-[#e5a93c]">
                            <span>{snapshot.npcName}</span>
                            {turn.source === 'fallback' && (
                              <span className="px-1.5 py-0.2 rounded bg-[#222f26] text-[#9eb4a2] font-normal">
                                {t.aiFallbackTag}
                              </span>
                            )}
                          </div>
                        )}
                        <p>{turn.text}</p>
                      </div>
                    </div>
                  );
                })
              )}

              {isSending && (
                <div className="flex items-center gap-2 text-xs text-[#9eb4a2] px-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#7fe094]" />
                  <span>{t.aiThinking(snapshot.npcName)}</span>
                </div>
              )}
            </div>

            {/* Suggested Character Topics */}
            {snapshot.suggestedPrompts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {snapshot.suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={isSending}
                    onClick={() => void handleSendAiMessage(prompt)}
                    className="px-2.5 py-1 rounded-lg bg-[#16261d] hover:bg-[#1f3529] disabled:opacity-50 border border-[#2c4637] text-[11px] text-[#cfe0ce] text-start transition-colors cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSendAiMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={t.aiInputPlaceholder(snapshot.npcName)}
                maxLength={360}
                disabled={isSending}
                data-testid="ai-dialogue-input"
                className="flex-1 min-w-0 min-h-[42px] px-3.5 rounded-xl bg-[#0c1510] border border-[#2d4638] focus:border-[#e5a93c] focus:outline-none text-xs sm:text-sm text-[#f2f6ef] placeholder:text-[#718876]"
              />
              <button
                type="submit"
                disabled={isSending || !chatInput.trim()}
                data-testid="ai-dialogue-send-btn"
                className="min-h-[42px] px-4 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] disabled:opacity-45 text-[#111914] font-display font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t.aiSendBtn}</span>
              </button>
              {chatHistory.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearChat}
                  title={t.aiClearHistoryBtn}
                  aria-label={t.aiClearHistoryBtn}
                  className="min-h-[42px] w-[42px] rounded-xl bg-[#18271f] hover:bg-[#22372c] border border-[#2d4537] text-[#a9bda9] flex items-center justify-center cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
