import React from 'react';
import type { Language } from '../game/i18n/translations';
import type {
  NewWorldOptions,
  SaveGameMeta,
  SaveSlotId,
} from '../game/save/saveTypes';
import type {
  GameSettings,
  MobileControlSettings,
} from '../game/types';
import type { GraphicsSettings } from '../game/engine/GraphicsQualityManager';
import type { ExtendedGameSettings } from '../game/settings/GameSettingsStore';
import { MainMenu } from './menu/MainMenu';
import { CreateWorldScreen } from './menu/CreateWorldScreen';
import { WorldSelectionScreen } from './menu/WorldSelectionScreen';
import { SettingsScreen } from './menu/SettingsScreen';
import { MultiplayerScreen } from './menu/MultiplayerScreen';
import { ExitConfirmationDialog } from './menu/ExitConfirmationDialog';
import type {
  IMultiplayerService,
  MultiplayerGameStartInfo,
} from '../game/multiplayer/multiplayerTypes';

export type TitleSubScreen =
  | 'main'
  | 'newWorld'
  | 'loadWorld'
  | 'multiplayer'
  | 'settings'
  | 'exit';

interface TitleScreenProps {
  lang: Language;
  subScreen: TitleSubScreen;
  latestSave: SaveGameMeta | null;
  savedWorlds: SaveGameMeta[];
  showMobileControls: boolean;
  muted: boolean;
  graphicsSettings: GraphicsSettings;
  extendedSettings: ExtendedGameSettings;
  gameSettings: GameSettings;
  mobileSettings: MobileControlSettings;
  onChangeSubScreen: (next: TitleSubScreen) => void;
  onToggleLanguage: () => void;
  onToggleMute: () => void;
  onContinue: () => void;
  onCreateWorld: (options: NewWorldOptions) => void;
  onPlayWorld: (slotId: SaveSlotId) => void;
  onDeleteWorld: (slotId: SaveSlotId) => void;
  onApplySettings: (payload: {
    lang: Language;
    graphics: GraphicsSettings;
    extended: ExtendedGameSettings;
    game: GameSettings;
    mobile: MobileControlSettings;
  }) => void;
  onResetAllSettings: () => void;
  onOpenCustomizeControls: () => void;
  multiplayerService?: IMultiplayerService;
  initialJoinCode?: string | null;
  onConsumeInitialJoinCode?: () => void;
  onStartMultiplayerWorld?: (info: MultiplayerGameStartInfo) => void;
  onOpenProfile?: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  lang,
  subScreen,
  latestSave,
  savedWorlds,
  showMobileControls,
  muted,
  graphicsSettings,
  extendedSettings,
  gameSettings,
  mobileSettings,
  onChangeSubScreen,
  onToggleLanguage,
  onToggleMute,
  onContinue,
  onCreateWorld,
  onPlayWorld,
  onDeleteWorld,
  onApplySettings,
  onResetAllSettings,
  onOpenCustomizeControls,
  multiplayerService,
  initialJoinCode,
  onConsumeInitialJoinCode,
  onStartMultiplayerWorld,
  onOpenProfile,
}) => {
  return (
    <div className="fixed inset-0 z-30 pointer-events-none">
      {/* Cinematic atmospheric gradient scrim preserving the 3D valley vista */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 70% 42%, rgba(9,18,13,0.12) 0%, rgba(8,16,12,0.52) 68%, rgba(6,12,9,0.78) 100%), linear-gradient(180deg, rgba(8,16,12,0.52) 0%, rgba(8,16,12,0.12) 45%, rgba(7,14,10,0.72) 100%)',
        }}
      />

      <MainMenu
        lang={lang}
        latestSave={latestSave}
        muted={muted}
        showMobileControls={showMobileControls}
        isModalBlocking={subScreen !== 'main'}
        onToggleLanguage={onToggleLanguage}
        onToggleMute={onToggleMute}
        onNewWorld={() => onChangeSubScreen('newWorld')}
        onContinue={onContinue}
        onLoadWorld={() => onChangeSubScreen('loadWorld')}
        onMultiplayer={() => onChangeSubScreen('multiplayer')}
        onSettings={() => onChangeSubScreen('settings')}
        onExitGame={() => onChangeSubScreen('exit')}
        onOpenProfile={onOpenProfile}
      />

      {subScreen === 'newWorld' && (
        <CreateWorldScreen
          lang={lang}
          defaultDifficulty={extendedSettings.gameplay.difficulty}
          onCreateWorld={onCreateWorld}
          onBack={() => onChangeSubScreen('main')}
        />
      )}

      {subScreen === 'loadWorld' && (
        <WorldSelectionScreen
          lang={lang}
          worlds={savedWorlds}
          onPlayWorld={onPlayWorld}
          onDeleteWorld={onDeleteWorld}
          onCreateNewWorld={() => onChangeSubScreen('newWorld')}
          onBack={() => onChangeSubScreen('main')}
        />
      )}

      {subScreen === 'multiplayer' && (
        <MultiplayerScreen
          lang={lang}
          service={multiplayerService}
          initialJoinCode={initialJoinCode}
          onConsumeInitialJoinCode={onConsumeInitialJoinCode}
          onStartMultiplayerWorld={onStartMultiplayerWorld}
          onBack={() => onChangeSubScreen('main')}
        />
      )}

      {subScreen === 'settings' && (
        <SettingsScreen
          lang={lang}
          graphicsSettings={graphicsSettings}
          extendedSettings={extendedSettings}
          gameSettings={gameSettings}
          mobileSettings={mobileSettings}
          showMobileControls={showMobileControls}
          onApply={onApplySettings}
          onResetAll={onResetAllSettings}
          onOpenCustomizeControls={onOpenCustomizeControls}
          onBack={() => onChangeSubScreen('main')}
        />
      )}

      {subScreen === 'exit' && (
        <ExitConfirmationDialog
          lang={lang}
          onClose={() => onChangeSubScreen('main')}
        />
      )}
    </div>
  );
};
