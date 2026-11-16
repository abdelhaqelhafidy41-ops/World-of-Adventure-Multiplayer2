import React from 'react';
import { Trash2 } from 'lucide-react';
import {
  BIOME_LABELS,
  UI_TEXT,
  type Language,
} from '../../game/i18n/translations';
import type { BiomeType } from '../../game/types';
import type { DifficultyLevel, SaveGameMeta, WorldType } from '../../game/save/saveTypes';

interface WorldCardProps {
  world: SaveGameMeta;
  selected: boolean;
  lang: Language;
  onSelect: () => void;
  onDeleteRequest: () => void;
}

function formatPlayTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function formatSavedDate(ms: number, lang: Language): string {
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleDateString();
  }
}

function getWorldTypeLabel(type: WorldType, lang: Language): string {
  const t = UI_TEXT[lang];
  switch (type) {
    case 'adventure':
      return t.worldTypeAdventure;
    case 'survival':
      return t.worldTypeSurvival;
    case 'creative':
      return t.worldTypeCreative;
    case 'normal':
    default:
      return t.worldTypeNormal;
  }
}

function getDifficultyLabel(diff: DifficultyLevel, lang: Language): string {
  const t = UI_TEXT[lang];
  switch (diff) {
    case 'easy':
      return t.diffEasy;
    case 'hard':
      return t.diffHard;
    case 'normal':
    default:
      return t.diffNormal;
  }
}

const BiomeFallbackArt: React.FC<{ biome: BiomeType; seed: number }> = ({
  biome,
  seed,
}) => {
  const palette: Record<
    BiomeType,
    { skyTop: string; skyBottom: string; farHill: string; nearHill: string; sun: string }
  > = {
    Plains: {
      skyTop: '#244f5c',
      skyBottom: '#7eb2a8',
      farHill: '#2d5c46',
      nearHill: '#1d402f',
      sun: '#f2c464',
    },
    Forest: {
      skyTop: '#1a3833',
      skyBottom: '#5a8b78',
      farHill: '#1d4534',
      nearHill: '#112a1f',
      sun: '#e8b95b',
    },
    Mountains: {
      skyTop: '#1e2c44',
      skyBottom: '#6a84a3',
      farHill: '#39485e',
      nearHill: '#232e3f',
      sun: '#f3d89b',
    },
    Desert: {
      skyTop: '#4e3b2d',
      skyBottom: '#d49a60',
      farHill: '#9c6838',
      nearHill: '#6e4522',
      sun: '#ffda85',
    },
    Beach: {
      skyTop: '#245873',
      skyBottom: '#8ccad1',
      farHill: '#327b82',
      nearHill: '#c9ad76',
      sun: '#ffe38f',
    },
  };

  const c = palette[biome] ?? palette.Plains;
  const sunX = 104 + (seed % 32);

  return (
    <svg
      viewBox="0 0 160 96"
      className="w-full h-full object-cover"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`sky-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.skyTop} />
          <stop offset="100%" stopColor={c.skyBottom} />
        </linearGradient>
      </defs>
      <rect width="160" height="96" fill={`url(#sky-${seed})`} />
      <circle cx={sunX} cy="26" r="10" fill={c.sun} opacity="0.9" />
      <path d="M0 64 Q40 38 82 58 T160 52 L160 96 L0 96 Z" fill={c.farHill} />
      <path d="M0 74 Q48 56 98 72 T160 66 L160 96 L0 96 Z" fill={c.nearHill} />
    </svg>
  );
};

export const WorldCard: React.FC<WorldCardProps> = ({
  world,
  selected,
  lang,
  onSelect,
  onDeleteRequest,
}) => {
  const t = UI_TEXT[lang];
  const worldTypeLabel = getWorldTypeLabel(world.worldType, lang);
  const diffLabel = getDifficultyLabel(world.difficulty, lang);
  const biomeLabel = BIOME_LABELS[lang][world.biome];

  return (
    <div
      data-testid={`world-card-${world.slotId}`}
      className={`woa-surface group relative rounded-2xl border transition-[background-color,border-color,transform] duration-150 overflow-hidden ${
        selected
          ? 'bg-[#1a3024] border-[#e5a93c] shadow-[0_8px_24px_rgba(229,169,60,0.16)]'
          : 'bg-[#0d1812]/90 hover:bg-[#14251c] border-white/12 hover:border-white/25'
      }`}
    >
      <div className="flex items-stretch gap-3 p-3">
        <button
          type="button"
          onClick={onSelect}
          data-testid={`world-select-${world.slotId}`}
          className="flex-1 min-w-0 flex items-center gap-3.5 text-start cursor-pointer focus-visible:outline-2 focus-visible:outline-[#e5a93c] rounded-xl"
        >
          {/* World Thumbnail */}
          <div className="w-24 h-16 sm:w-28 sm:h-18 rounded-xl overflow-hidden border border-white/12 bg-[#09120d] shrink-0">
            {world.thumbnailDataUrl ? (
              <img
                src={world.thumbnailDataUrl}
                alt={world.worldName}
                className="w-full h-full object-cover"
              />
            ) : (
              <BiomeFallbackArt biome={world.biome} seed={world.worldSeed} />
            )}
          </div>

          {/* Unboxed Metadata Typography */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-display font-bold text-sm sm:text-base text-[#f7faf5] truncate">
                {world.worldName}
              </h3>
              <span className="font-mono-num text-[11px] sm:text-xs font-semibold text-[#e5a93c] shrink-0">
                {t.levelShort}
                {world.level}
              </span>
            </div>

            <p className="woa-muted-text text-xs text-[#b5c7b7] truncate mt-0.5">
              {worldTypeLabel} · {diffLabel} · {biomeLabel}
            </p>

            <div className="woa-muted-text flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-[#8fa493] mt-1.5 font-mono-num">
              <span>
                {t.seedLabel}: {world.worldSeed}
              </span>
              <span>·</span>
              <span>
                {t.playTimeLabel}: {formatPlayTime(world.playTimeSeconds)}
              </span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline font-sans">
                {formatSavedDate(world.savedAtMs, lang)}
              </span>
            </div>
          </div>
        </button>

        {/* Delete Trigger */}
        <button
          type="button"
          data-testid={`world-delete-icon-${world.slotId}`}
          aria-label={`${t.deleteWorldBtn}: ${world.worldName}`}
          title={t.deleteWorldBtn}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteRequest();
          }}
          className="min-w-[44px] min-h-[44px] self-center rounded-xl bg-[#18241e] hover:bg-[#3a1a1c] border border-white/10 hover:border-[#e05a47]/60 text-[#9db1a1] hover:text-[#f28b7d] inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
