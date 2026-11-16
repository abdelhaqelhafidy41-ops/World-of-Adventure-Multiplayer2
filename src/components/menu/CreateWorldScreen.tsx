import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Compass,
  Dices,
  Flame,
  Hammer,
  Shield,
  Sparkles,
} from 'lucide-react';
import { UI_TEXT, type Language } from '../../game/i18n/translations';
import type {
  DifficultyLevel,
  NewWorldOptions,
  WorldType,
} from '../../game/save/saveTypes';
import { DEFAULT_WORLD_SEED } from '../../game/math/noise';
import {
  STAMINA_BY_MODE,
  isInfiniteStaminaMode,
} from '../../game/player/staminaConfig';

interface CreateWorldScreenProps {
  lang: Language;
  defaultDifficulty?: DifficultyLevel;
  onCreateWorld: (options: NewWorldOptions) => void;
  onBack: () => void;
}

function generateRandomSeed(): number {
  return Math.floor(100000 + Math.random() * 899999);
}

function parseSeedInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return generateRandomSeed();
  if (/^-?\d+$/.test(trimmed)) {
    const num = Math.abs(parseInt(trimmed, 10));
    return num > 0 ? num : DEFAULT_WORLD_SEED;
  }
  let hash = 2166136261;
  for (let i = 0; i < trimmed.length; i++) {
    hash ^= trimmed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || DEFAULT_WORLD_SEED;
}

export const CreateWorldScreen: React.FC<CreateWorldScreenProps> = ({
  lang,
  defaultDifficulty = 'normal',
  onCreateWorld,
  onBack,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';

  const [worldName, setWorldName] = useState(() =>
    lang === 'ar' ? 'وادي أوكهولو' : 'Oakhollow Chronicle',
  );
  const [seedInput, setSeedInput] = useState<string>(() =>
    String(generateRandomSeed()),
  );
  const [worldType, setWorldType] = useState<WorldType>('normal');
  const [difficulty, setDifficulty] =
    useState<DifficultyLevel>(defaultDifficulty);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onBack]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = worldName.trim();
    if (!cleaned) {
      setNameError(t.worldNameRequiredError);
      return;
    }
    setNameError(null);
    onCreateWorld({
      worldName: cleaned.slice(0, 40),
      seed: parseSeedInput(seedInput),
      worldType,
      difficulty,
    });
  };

  const worldTypes: Array<{
    id: WorldType;
    label: string;
    desc: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'normal',
      label: t.worldTypeNormal,
      desc: t.worldTypeNormalDesc,
      icon: <Compass className="w-4 h-4" />,
    },
    {
      id: 'adventure',
      label: t.worldTypeAdventure,
      desc: t.worldTypeAdventureDesc,
      icon: <Sparkles className="w-4 h-4" />,
    },
    {
      id: 'survival',
      label: t.worldTypeSurvival,
      desc: t.worldTypeSurvivalDesc,
      icon: <Flame className="w-4 h-4" />,
    },
    {
      id: 'creative',
      label: t.worldTypeCreative,
      desc: t.worldTypeCreativeDesc,
      icon: <Hammer className="w-4 h-4" />,
    },
  ];

  const difficulties: Array<{ id: DifficultyLevel; label: string }> = [
    { id: 'easy', label: t.diffEasy },
    { id: 'normal', label: t.diffNormal },
    { id: 'hard', label: t.diffHard },
  ];

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#08110c]/72 backdrop-blur-md p-3 sm:p-6 mobile-hud-safe pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-world-title"
      data-testid="create-world-screen"
    >
      <form
        onSubmit={handleSubmit}
        className="woa-surface w-full max-w-xl max-h-[90dvh] flex flex-col rounded-2xl bg-[#101c16]/94 border border-[#2b4436] text-[#f2f6ef] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
          <div>
            <h2
              id="create-world-title"
              className="font-display text-xl sm:text-2xl font-bold tracking-tight"
            >
              {t.createWorldTitle}
            </h2>
            <p className="woa-muted-text text-xs sm:text-sm text-[#9db1a1] mt-0.5">
              {t.createWorldSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            data-testid="create-world-back-top"
            className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-white/12 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-[#dce5d8] cursor-pointer shrink-0"
          >
            <ArrowLeft className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
            <span className="hidden sm:inline">{t.backBtn}</span>
          </button>
        </div>

        {/* Scrollable Fields */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* World Name */}
          <div>
            <label
              htmlFor="world-name-input"
              className="block text-xs sm:text-sm font-semibold text-[#e6eee4] mb-1.5"
            >
              {t.worldNameLabel}
            </label>
            <input
              id="world-name-input"
              type="text"
              data-testid="world-name-input"
              maxLength={40}
              value={worldName}
              onChange={(e) => {
                setWorldName(e.target.value);
                if (nameError && e.target.value.trim()) setNameError(null);
              }}
              placeholder={t.worldNamePlaceholder}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-sm text-[#f7faf5] placeholder-[#687e6d]"
            />
            {nameError && (
              <p
                data-testid="world-name-error"
                className="mt-1.5 text-xs font-medium text-[#f28b7d]"
              >
                {nameError}
              </p>
            )}
          </div>

          {/* World Seed */}
          <div>
            <label
              htmlFor="world-seed-input"
              className="block text-xs sm:text-sm font-semibold text-[#e6eee4] mb-1.5"
            >
              {t.worldSeedLabel}
            </label>
            <div className="flex gap-2">
              <input
                id="world-seed-input"
                type="text"
                data-testid="world-seed-input"
                maxLength={24}
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                placeholder={t.worldSeedPlaceholder}
                dir="ltr"
                className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-sm font-mono-num text-[#f7faf5] placeholder-[#687e6d]"
              />
              <button
                type="button"
                data-testid="random-seed-btn"
                onClick={() => setSeedInput(String(generateRandomSeed()))}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#192c22] hover:bg-[#233d2f] border border-[#345443] text-xs sm:text-sm font-medium text-[#f2f6ef] inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Dices className="w-4 h-4 text-[#e5a93c]" />
                <span>{t.randomSeedBtn}</span>
              </button>
            </div>
          </div>

          {/* World Type */}
          <div>
            <div className="text-xs sm:text-sm font-semibold text-[#e6eee4] mb-2">
              {t.worldTypeLabel}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {worldTypes.map((wt) => {
                const selected = worldType === wt.id;
                const modeStamina = STAMINA_BY_MODE[wt.id];
                const isInf = isInfiniteStaminaMode(wt.id);
                const staminaBadge = isInf ? '∞' : String(modeStamina);
                return (
                  <button
                    key={wt.id}
                    type="button"
                    data-testid={`world-type-${wt.id}`}
                    aria-pressed={selected}
                    onClick={() => setWorldType(wt.id)}
                    className={`min-h-[60px] p-3 rounded-xl border text-start transition-colors cursor-pointer flex items-start gap-2.5 ${
                      selected
                        ? 'bg-[#20382b] border-[#e5a93c] text-[#ffffff]'
                        : 'bg-[#0c1712] hover:bg-[#15251d] border-[#294034] text-[#dce5d8]'
                    }`}
                  >
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        selected
                          ? 'bg-[#e5a93c] text-[#111914]'
                          : 'bg-white/8 text-[#e5a93c]'
                      }`}
                    >
                      {wt.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-display font-bold text-sm leading-tight truncate">
                          {wt.label}
                        </span>
                        <span
                          dir="ltr"
                          data-testid={`world-type-stamina-${wt.id}`}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono-num font-bold shrink-0 ${
                            isInf
                              ? 'bg-[#0c2734] border border-[#38bdf8]/45 text-[#7dd3fc]'
                              : 'bg-[#17281e] border border-[#2f493b] text-[#e6b34d]'
                          }`}
                        >
                          {t.staminaModeBadge(staminaBadge)}
                        </span>
                      </span>
                      <span className="woa-muted-text block text-[11px] text-[#9cb0a0] mt-0.5 leading-snug">
                        {wt.desc}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#e6eee4] mb-2">
              <Shield className="w-4 h-4 text-[#7fe094]" />
              <span>{t.difficultyLabel}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {difficulties.map((d) => {
                const selected = difficulty === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    data-testid={`difficulty-${d.id}`}
                    aria-pressed={selected}
                    onClick={() => setDifficulty(d.id)}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border font-display font-semibold text-xs sm:text-sm transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#20382b] border-[#e5a93c] text-[#ffffff]'
                        : 'bg-[#0c1712] hover:bg-[#15251d] border-[#294034] text-[#b9cbbd]'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-white/10 bg-[#0c1611]/90 flex flex-col sm:flex-row-reverse gap-2.5 shrink-0">
          <button
            type="submit"
            data-testid="create-world-submit-btn"
            className="flex-1 min-h-[48px] px-5 py-3 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-sm sm:text-base tracking-wide transition-colors cursor-pointer"
          >
            {t.createWorldBtn}
          </button>
          <button
            type="button"
            data-testid="create-world-back-btn"
            onClick={onBack}
            className="sm:min-w-[120px] min-h-[48px] px-4 py-3 rounded-xl bg-[#182920] hover:bg-[#22382c] border border-[#2f493b] text-sm font-semibold text-[#e4ece1] transition-colors cursor-pointer"
          >
            {t.backBtn}
          </button>
        </div>
      </form>
    </div>
  );
};
