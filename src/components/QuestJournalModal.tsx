import React, { useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Coins,
  Compass,
  ScrollText,
  Sparkles,
  X,
} from 'lucide-react';
import type { QuestView } from '../game/quest/questTypes';
import {
  QUEST_STATUS_LABELS,
  UI_TEXT,
  type Language,
} from '../game/i18n/translations';

interface QuestJournalModalProps {
  activeQuests: QuestView[];
  completedQuests: QuestView[];
  availableQuests: QuestView[];
  level: number;
  xp: number;
  xpToNextLevel: number;
  coins: number;
  lang: Language;
  onTrackQuest: (questId: string) => void;
  onClose: () => void;
}

type JournalTab = 'active' | 'completed' | 'available';

export const QuestJournalModal: React.FC<QuestJournalModalProps> = ({
  activeQuests,
  completedQuests,
  availableQuests,
  level,
  xp,
  xpToNextLevel,
  coins,
  lang,
  onTrackQuest,
  onClose,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';
  const [tab, setTab] = useState<JournalTab>(
    activeQuests.length > 0 ? 'active' : 'available',
  );

  const xpPct = Math.max(0, Math.min(100, (xp / Math.max(1, xpToNextLevel)) * 100));
  const list =
    tab === 'active'
      ? activeQuests
      : tab === 'completed'
        ? completedQuests
        : availableQuests;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#09110d]/72 p-3 sm:p-4 mobile-hud-safe"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quest-journal-title"
      data-testid="quest-journal-modal"
    >
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-2xl bg-[#101c16] border border-[#2a3f33] p-4 sm:p-6 text-[#f1f5ee] shadow-2xl overflow-x-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <ScrollText className="w-5 h-5 text-[#e5a93c]" />
            <h2 id="quest-journal-title" className="font-display text-xl font-bold">
              {t.questJournal}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] rounded-lg bg-[#192a21] hover:bg-[#22392d] border border-[#2f493b] flex items-center justify-center cursor-pointer"
            aria-label={t.closeBtn}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Adventurer Progression Bar */}
        <div className="mb-4 p-3.5 rounded-xl bg-[#15241c] border border-[#273f31] flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 min-w-[180px]">
            <div className="flex items-center justify-between text-xs font-medium mb-1.5">
              <span className="font-display font-bold text-[#f3f7f0]">
                {t.levelAdventurer(level)}
              </span>
              <span className="font-mono-num text-[#b8ccb9]">
                {xp} / {xpToNextLevel} {t.xpShort}
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#0d1712] overflow-hidden">
              <div
                className="h-full bg-[#e5a93c] transition-[width] duration-200"
                style={{ width: `${xpPct}%` }}
              />
            </div>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-[#1b2d23] border border-[#2f493a] flex items-center gap-2">
            <Coins className="w-4 h-4 text-[#e5a93c]" />
            <span className="font-mono-num text-sm font-bold text-[#f5f8f2]">
              {coins}
            </span>
            <span className="text-xs text-[#9fb5a3]">{t.coinsLabel}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-4">
          <button
            type="button"
            onClick={() => setTab('active')}
            data-testid="quest-tab-active"
            className={`min-h-[40px] px-2 sm:px-3 py-2 rounded-xl border text-xs sm:text-sm font-semibold transition-colors cursor-pointer truncate ${
              tab === 'active'
                ? 'bg-[#21382c] border-[#e5a93c]/70 text-[#ffffff]'
                : 'bg-[#15241c] border-[#263c2f] text-[#a9beae] hover:bg-[#1b2f24]'
            }`}
          >
            {t.tabActive(activeQuests.length)}
          </button>
          <button
            type="button"
            onClick={() => setTab('completed')}
            data-testid="quest-tab-completed"
            className={`min-h-[40px] px-2 sm:px-3 py-2 rounded-xl border text-xs sm:text-sm font-semibold transition-colors cursor-pointer truncate ${
              tab === 'completed'
                ? 'bg-[#21382c] border-[#e5a93c]/70 text-[#ffffff]'
                : 'bg-[#15241c] border-[#263c2f] text-[#a9beae] hover:bg-[#1b2f24]'
            }`}
          >
            {t.tabCompleted(completedQuests.length)}
          </button>
          <button
            type="button"
            onClick={() => setTab('available')}
            data-testid="quest-tab-available"
            className={`min-h-[40px] px-2 sm:px-3 py-2 rounded-xl border text-xs sm:text-sm font-semibold transition-colors cursor-pointer truncate ${
              tab === 'available'
                ? 'bg-[#21382c] border-[#e5a93c]/70 text-[#ffffff]'
                : 'bg-[#15241c] border-[#263c2f] text-[#a9beae] hover:bg-[#1b2f24]'
            }`}
          >
            {t.tabAvailable(availableQuests.length)}
          </button>
        </div>

        {/* Quest List */}
        <div className="flex-1 overflow-y-auto space-y-3 pe-1">
          {list.length === 0 && (
            <div className="p-6 rounded-xl bg-[#15241c] border border-[#24392d] text-center text-sm text-[#9cb0a0]">
              {tab === 'active' && t.emptyActiveQuests}
              {tab === 'completed' && t.emptyCompletedQuests}
              {tab === 'available' && t.emptyAvailableQuests}
            </div>
          )}

          {list.map((q) => (
            <div
              key={q.id}
              data-testid={`journal-quest-${q.id}`}
              className="p-4 rounded-xl bg-[#16261d] border border-[#273e31]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display text-base font-bold text-[#f4f7f1]">
                    {q.title}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold tracking-wide ${
                      q.status === 'ready'
                        ? 'bg-[#1d3b28] text-[#98eba8] border-[#376b4b]'
                        : q.status === 'active'
                          ? 'bg-[#1d303c] text-[#94ccf2] border-[#355970]'
                          : q.status === 'completed'
                            ? 'bg-[#28352c] text-[#b4c8b9] border-[#425748]'
                            : 'bg-[#3a2d15] text-[#f5c76b] border-[#6b4f24]'
                    }`}
                  >
                    {QUEST_STATUS_LABELS[lang][q.status]}
                  </span>
                </div>

                {(q.status === 'active' || q.status === 'ready') && (
                  <button
                    type="button"
                    onClick={() => onTrackQuest(q.id)}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                      q.tracked
                        ? 'bg-[#e5a93c] border-[#e5a93c] text-[#111914]'
                        : 'bg-[#1b2e23] hover:bg-[#233b2d] border-[#314c3c] text-[#dce7dd]'
                    }`}
                  >
                    <Compass className="w-3 h-3" />
                    <span>{q.tracked ? t.trackedBtn : t.trackHudBtn}</span>
                  </button>
                )}
              </div>

              <p className="text-xs text-[#9eb3a3] leading-relaxed mb-3">
                {q.description}
              </p>

              {/* Objectives */}
              <div className="space-y-1.5 mb-3">
                {q.objectives.map((obj, idx) => (
                  <div
                    key={obj.id}
                    className={`flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-lg ${
                      obj.completed
                        ? 'bg-[#13221a] text-[#8ca894] line-through'
                        : obj.active
                          ? 'bg-[#1c3024] text-[#f4f7f1] border border-[#e5a93c]/35'
                          : 'bg-[#13211a] text-[#889e8e]'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      {obj.completed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#78d48b] shrink-0" />
                      ) : (
                        <Circle
                          className={`w-3.5 h-3.5 shrink-0 ${
                            obj.active ? 'text-[#e5a93c]' : 'text-[#5b7162]'
                          }`}
                        />
                      )}
                      <span>
                        {idx + 1}. {obj.description}
                      </span>
                    </span>
                    {obj.target > 1 && (
                      <span className="font-mono-num text-[11px] text-[#d9e5da]" dir="ltr">
                        {obj.current}/{obj.target}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Reward */}
              <div className="flex items-center gap-1.5 text-[11px] text-[#e5a93c]">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {t.rewardLabel} {q.rewardSummary}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
