import React, { useState } from 'react';
import {
  AlertCircle,
  Compass,
  FolderOpen,
  Languages,
  LogOut,
  Play,
  PlusCircle,
  Settings,
  User,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  BIOME_LABELS,
  UI_TEXT,
  type Language,
} from '../../game/i18n/translations';
import { ProfileManager } from '../../game/profile/ProfileManager';
import type { SaveGameMeta } from '../../game/save/saveTypes';
import { useMenuNavigation } from '../../hooks/useMenuNavigation';
import { AvatarBadge } from '../profile/AvatarBadge';
import { MainMenuButton } from './MainMenuButton';

interface MainMenuProps {
  lang: Language;
  latestSave: SaveGameMeta | null;
  muted: boolean;
  showMobileControls: boolean;
  isModalBlocking: boolean;
  onToggleLanguage: () => void;
  onToggleMute: () => void;
  onNewWorld: () => void;
  onContinue: () => void;
  onLoadWorld: () => void;
  onMultiplayer: () => void;
  onSettings: () => void;
  onExitGame: () => void;
  onOpenProfile?: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  lang,
  latestSave,
  muted,
  showMobileControls,
  isModalBlocking,
  onToggleLanguage,
  onToggleMute,
  onNewWorld,
  onContinue,
  onLoadWorld,
  onMultiplayer,
  onSettings,
  onExitGame,
  onOpenProfile,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';
  const [noSaveModalOpen, setNoSaveModalOpen] = useState(false);
  const [profileSnap, setProfileSnap] = React.useState(() =>
    ProfileManager.getSnapshot(),
  );

  React.useEffect(() => {
    return ProfileManager.subscribe((next) => setProfileSnap(next));
  }, []);

  const handleContinuePress = () => {
    if (!latestSave) {
      setNoSaveModalOpen(true);
      return;
    }
    onContinue();
  };

  const buttonActions = [
    onNewWorld,
    handleContinuePress,
    onLoadWorld,
    onMultiplayer,
    onSettings,
    onExitGame,
  ];

  const { focusedIndex, setFocusedIndex, registerItem } = useMenuNavigation({
    enabled: !isModalBlocking && !noSaveModalOpen,
    itemCount: buttonActions.length,
    orientation: 'vertical',
    onActivate: (idx) => {
      buttonActions[idx]?.();
    },
  });

  const continueSubtitle = latestSave
    ? `${latestSave.worldName} · ${t.levelShort}${latestSave.level} ${BIOME_LABELS[lang][latestSave.biome]}`
    : undefined;

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="relative z-10 flex flex-col justify-between h-full w-full p-3.5 sm:p-6 md:p-10 mobile-hud-safe pointer-events-none overflow-y-auto overflow-x-hidden"
    >
      {/* Top Utility Row */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="inline-flex items-center gap-2.5 text-xs font-medium text-[#d4e3ce] opacity-90">
          <Compass className="w-4 h-4 text-[#e5a93c]" />
          <span className="hidden sm:inline tracking-wide">
            {t.openWorldSubtitle}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onOpenProfile && (
            <button
              type="button"
              data-testid="title-profile-btn"
              onClick={onOpenProfile}
              className="woa-surface pointer-events-auto inline-flex items-center gap-2 min-h-[44px] px-3 py-1.5 rounded-xl bg-[#0e1a14]/78 backdrop-blur-md border border-white/15 text-xs font-medium text-[#e9efe6] hover:bg-[#182920] transition-colors focus-visible:outline-2 focus-visible:outline-[#e5a93c] whitespace-nowrap shrink-0 cursor-pointer"
            >
              {profileSnap.profile ? (
                <>
                  <AvatarBadge
                    avatar={profileSnap.profile.avatar}
                    seed={profileSnap.profile.publicProfileId}
                    displayName={profileSnap.profile.displayName}
                    size="xs"
                    status={profileSnap.profile.presenceStatus}
                  />
                  <span dir="auto" className="max-w-[105px] truncate font-semibold">
                    {profileSnap.profile.displayName}
                  </span>
                  <span className="hidden sm:inline font-mono-num text-[11px] text-[#e5a93c]">
                    {t.levelShort}{profileSnap.profile.stats.level}
                  </span>
                </>
              ) : (
                <>
                  <User className="w-4 h-4 text-[#e5a93c]" />
                  <span>{t.profileOpenBtn}</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            data-testid="title-language-toggle"
            onClick={onToggleLanguage}
            className="woa-surface pointer-events-auto inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0e1a14]/78 backdrop-blur-md border border-white/15 text-xs font-medium text-[#e9efe6] hover:bg-[#182920] transition-colors focus-visible:outline-2 focus-visible:outline-[#e5a93c] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Languages className="w-4 h-4 text-[#e5a93c]" />
            <span>{lang === 'en' ? 'العربية' : 'English'}</span>
          </button>

          <button
            type="button"
            data-testid="title-mute-toggle"
            onClick={onToggleMute}
            className="woa-surface pointer-events-auto inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0e1a14]/78 backdrop-blur-md border border-white/15 text-xs font-medium text-[#e9efe6] hover:bg-[#182920] transition-colors focus-visible:outline-2 focus-visible:outline-[#7ec879] whitespace-nowrap shrink-0 cursor-pointer"
            aria-label={muted ? t.soundOff : t.soundOn}
          >
            {muted ? (
              <VolumeX className="w-4 h-4 text-[#f28b7d]" />
            ) : (
              <Volume2 className="w-4 h-4 text-[#7ec879]" />
            )}
            <span className="hidden sm:inline">
              {muted ? t.soundOff : t.soundOn}
            </span>
          </button>
        </div>
      </div>

      {/* Center / Hero Brand + Vertical 5-Button Menu */}
      <div className="my-auto py-2 sm:py-6 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 sm:gap-6 lg:gap-10">
        {/* Title & Subtitle Block */}
        <div className="max-w-xl flex flex-col items-start">
          <div className="flex items-center gap-2.5 sm:gap-3 mb-2 sm:mb-3">
            <svg
              width="44"
              height="44"
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              className="w-8 h-8 sm:w-11 sm:h-11 shrink-0 drop-shadow-md"
            >
              <circle
                cx="32"
                cy="32"
                r="29"
                fill="#122119"
                stroke="#e5a93c"
                strokeWidth="2.5"
              />
              <path
                d="M15 44L26.5 24L34.5 36L40 27.5L49 44H15Z"
                fill="#2c6e58"
                stroke="#f5f8f2"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <circle cx="44" cy="18" r="3.5" fill="#eab354" />
            </svg>
            <div className="h-[1px] w-8 sm:w-10 bg-gradient-to-r from-[#e5a93c]/80 to-transparent" />
            <span className="text-[11px] sm:text-sm font-medium tracking-[0.16em] sm:tracking-[0.18em] uppercase text-[#e5a93c] drop-shadow-sm">
              {t.menuSubtitle}
            </span>
          </div>

          <h1
            className="font-display text-2xl min-[380px]:text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-[#f7faf5] leading-[1.05] uppercase drop-shadow-[0_4px_20px_rgba(0,0,0,0.65)]"
            data-testid="main-menu-title"
          >
            {lang === 'en' ? 'WORLD OF ADVENTURE' : t.gameTitle}
          </h1>

          <p className="mt-1.5 sm:mt-3 text-xs sm:text-sm md:text-base text-[#dbe5d7]/90 max-w-md leading-snug sm:leading-relaxed drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]">
            {t.heroTagline}
          </p>
        </div>

        {/* Exact 6-Button Main Menu Stack */}
        <nav
          aria-label="Main Menu"
          className="w-full max-w-sm flex flex-col gap-2 sm:gap-2.5"
          data-testid="main-menu-buttons"
        >
          <MainMenuButton
            testId="menu-btn-new-world"
            label={t.menuNewWorld}
            icon={<PlusCircle className="w-5 h-5" />}
            variant="primary"
            isRtl={isRtl}
            focused={focusedIndex === 0}
            buttonRef={registerItem(0)}
            onClick={() => {
              setFocusedIndex(0);
              onNewWorld();
            }}
          />

          <MainMenuButton
            testId="menu-btn-continue"
            label={t.menuContinue}
            subtitle={continueSubtitle}
            icon={<Play className="w-5 h-5 fill-current" />}
            isRtl={isRtl}
            focused={focusedIndex === 1}
            buttonRef={registerItem(1)}
            onClick={() => {
              setFocusedIndex(1);
              handleContinuePress();
            }}
          />

          <MainMenuButton
            testId="menu-btn-load-world"
            label={t.menuLoadWorld}
            icon={<FolderOpen className="w-5 h-5" />}
            isRtl={isRtl}
            focused={focusedIndex === 2}
            buttonRef={registerItem(2)}
            onClick={() => {
              setFocusedIndex(2);
              onLoadWorld();
            }}
          />

          <MainMenuButton
            testId="menu-btn-multiplayer"
            label={t.menuMultiplayer}
            icon={<Users className="w-5 h-5" />}
            isRtl={isRtl}
            focused={focusedIndex === 3}
            buttonRef={registerItem(3)}
            onClick={() => {
              setFocusedIndex(3);
              onMultiplayer();
            }}
          />

          <MainMenuButton
            testId="menu-btn-settings"
            label={t.menuSettings}
            icon={<Settings className="w-5 h-5" />}
            isRtl={isRtl}
            focused={focusedIndex === 4}
            buttonRef={registerItem(4)}
            onClick={() => {
              setFocusedIndex(4);
              onSettings();
            }}
          />

          <MainMenuButton
            testId="menu-btn-exit"
            label={t.menuExitGame}
            icon={<LogOut className="w-5 h-5" />}
            variant="danger"
            isRtl={isRtl}
            focused={focusedIndex === 5}
            buttonRef={registerItem(5)}
            onClick={() => {
              setFocusedIndex(5);
              onExitGame();
            }}
          />
        </nav>
      </div>

      {/* Bottom Controls Hint */}
      <div className="shrink-0 flex items-center justify-between gap-4 text-[11px] sm:text-xs text-[#d4dfd0]/85 drop-shadow">
        <p className="leading-snug">
          {showMobileControls ? t.titleTouchControlsHint : t.titleControlsHint}
        </p>
      </div>

      {/* No Saved World Notice Modal */}
      {noSaveModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#070f0b]/76 backdrop-blur-sm p-4 mobile-hud-safe pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="no-save-title"
          data-testid="no-save-dialog"
        >
          <div className="woa-surface w-full max-w-sm rounded-2xl bg-[#101c16] border border-[#2d4638] p-6 text-[#f1f5ee] shadow-2xl">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-[#e5a93c]/15 border border-[#e5a93c]/35 flex items-center justify-center shrink-0 text-[#e5a93c]">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h2
                  id="no-save-title"
                  className="font-display text-lg font-bold text-[#f7faf5]"
                >
                  {t.noSavedWorldTitle}
                </h2>
                <p className="woa-muted-text text-xs sm:text-sm text-[#a8bba9] mt-1 leading-relaxed">
                  {t.noSavedWorldDesc}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                data-testid="no-save-create-btn"
                onClick={() => {
                  setNoSaveModalOpen(false);
                  onNewWorld();
                }}
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-sm transition-colors cursor-pointer"
              >
                {t.createNewWorldCta}
              </button>
              <button
                type="button"
                data-testid="no-save-close-btn"
                onClick={() => setNoSaveModalOpen(false)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#192b22] hover:bg-[#233a2e] border border-[#2f493b] text-sm font-medium text-[#e4ece1] transition-colors cursor-pointer"
              >
                {t.backBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
