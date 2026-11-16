import { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine } from './game/engine/GameEngine';
import { detectTouchDevice } from './game/input/MobileInputManager';
import {
  loadMobileSettings,
  saveMobileSettings,
  shouldShowMobileControls,
} from './game/input/MobileLayoutStore';
import {
  DEFAULT_MOBILE_SETTINGS,
  type ActiveModal,
  type GamePhase,
  type GameSettings,
  type MobileControlSettings,
  type PlayerHudSnapshot,
} from './game/types';
import type { MapWaypoint } from './game/world/MapManager';
import type { InventorySnapshot } from './game/inventory/inventoryTypes';
import type { DialogueSnapshot } from './game/dialogue/dialogueTypes';
import type {
  NewWorldOptions,
  SaveGameMeta,
  SaveSlotId,
  SaveSlotSummary,
} from './game/save/saveTypes';
import {
  UI_TEXT,
  loadSavedLanguage,
  saveLanguage,
  type Language,
} from './game/i18n/translations';
import { LoadingScreen } from './components/LoadingScreen';
import { TitleScreen, type TitleSubScreen } from './components/TitleScreen';
import { HudOverlay } from './components/HudOverlay';
import { MobileControlsOverlay } from './components/MobileControlsOverlay';
import { MobileSettingsModal } from './components/MobileSettingsModal';
import { InventoryModal } from './components/InventoryModal';
import { WorldMapModal } from './components/WorldMapModal';
import { DialogueModal } from './components/DialogueModal';
import { QuestJournalModal } from './components/QuestJournalModal';
import { PauseMenu } from './components/PauseMenu';
import { SaveSlotsModal } from './components/SaveSlotsModal';
import { GraphicsSettingsModal } from './components/GraphicsSettingsModal';
import { DebugPerformanceOverlay } from './components/DebugPerformanceOverlay';
import { SettingsScreen } from './components/menu/SettingsScreen';
import {
  loadGraphicsSettings,
  saveGraphicsSettings,
  type DebugPerformanceSnapshot,
  type GraphicsSettings,
  type ResolvedGraphicsProfile,
} from './game/engine/GraphicsQualityManager';
import {
  applyAccessibilityDocumentAttributes,
  createDefaultExtendedSettings,
  loadExtendedSettings,
  saveExtendedSettings,
  type ExtendedGameSettings,
} from './game/settings/GameSettingsStore';
import { Mail } from 'lucide-react';
import { useGamepadPauseButton } from './hooks/useMenuNavigation';
import {
  createMultiplayerService,
  loadSavedMultiplayerName,
} from './game/multiplayer/MultiplayerService';
import { extractJoinTargetFromUrl } from './game/multiplayer/inviteUtils';
import type {
  IMultiplayerService,
  MultiplayerConnectionState,
  MultiplayerGameStartInfo,
  MultiplayerInvite,
  MultiplayerRoomState,
} from './game/multiplayer/multiplayerTypes';
import { InGameMultiplayerChatModal } from './components/multiplayer/InGameMultiplayerChatModal';
import { ConnectionStatusBanner } from './components/multiplayer/ConnectionStatusBanner';
import { ProfileManager } from './game/profile/ProfileManager';
import { AvatarBadge } from './components/profile/AvatarBadge';
import { PlayerProfileModal } from './components/profile/PlayerProfileModal';
import { ProfileSetupModal } from './components/profile/ProfileSetupModal';

declare global {
  interface Window {
    __handleAndroidBack?: () => boolean;
    __handleMultiplayerJoinLink?: (url: string) => void;
  }
}

const INITIAL_HUD: PlayerHudSnapshot = {
  health: 100,
  maxHealth: 100,
  stamina: 100,
  maxStamina: 100,
  x: 0,
  y: 0,
  z: 4,
  headingDeg: 0,
  grounded: true,
  sprinting: false,
  speed: 0,
  biome: 'Plains',
  inWater: false,
  movementState: 'idle',
  nearbyInteractable: null,
  timeOfDayLabel: '08:30 · Morning',
  level: 1,
  xp: 0,
  xpToNextLevel: 100,
  coins: 0,
  trackedQuest: null,
};

const EMPTY_INVENTORY: InventorySnapshot = {
  capacity: 32,
  usedSlots: 0,
  slots: new Array(32).fill(null),
  equippedBySlot: {},
  bonuses: {
    maxHealthBonus: 0,
    maxStaminaBonus: 0,
    speedBonus: 0,
    damageReductionBonus: 0,
  },
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const multiplayerServiceRef = useRef<IMultiplayerService | null>(null);
  if (!multiplayerServiceRef.current) {
    multiplayerServiceRef.current = createMultiplayerService();
  }

  const [language, setLanguage] = useState<Language>(() => loadSavedLanguage());
  const [phase, setPhase] = useState<GamePhase>('loading');
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadLabel, setLoadLabel] = useState(() => UI_TEXT[loadSavedLanguage()].loadingDefault);
  const [hud, setHud] = useState<PlayerHudSnapshot>(INITIAL_HUD);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [inventorySnapshot, setInventorySnapshot] =
    useState<InventorySnapshot>(EMPTY_INVENTORY);
  const [dialogueSnapshot, setDialogueSnapshot] = useState<DialogueSnapshot | null>(null);
  const [worldNotice, setWorldNotice] = useState<string | null>(null);
  const [waypoint, setWaypoint] = useState<MapWaypoint | null>(null);
  const [saveSlots, setSaveSlots] = useState<SaveSlotSummary[]>([]);
  const [savedWorlds, setSavedWorlds] = useState<SaveGameMeta[]>([]);
  const [latestSave, setLatestSave] = useState<SaveGameMeta | null>(null);
  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(() =>
    extractJoinTargetFromUrl(),
  );
  const [incomingInvite, setIncomingInvite] = useState<MultiplayerInvite | null>(
    null,
  );
  const [acceptingInvite, setAcceptingInvite] = useState<boolean>(false);
  const [activeMpRoom, setActiveMpRoom] = useState<MultiplayerRoomState | null>(
    () => multiplayerServiceRef.current?.getRoomState() ?? null,
  );
  const [mpConnectionState, setMpConnectionState] =
    useState<MultiplayerConnectionState>(
      () => multiplayerServiceRef.current?.getConnectionState() ?? 'disconnected',
    );
  const [mpReconnectAttempt, setMpReconnectAttempt] = useState<number>(
    () => multiplayerServiceRef.current?.getReconnectAttempt() ?? 0,
  );
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [titleSubScreen, setTitleSubScreen] = useState<TitleSubScreen>(() =>
    extractJoinTargetFromUrl() ? 'multiplayer' : 'main',
  );
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileSetupOpen, setProfileSetupOpen] = useState(false);
  const languageRef = useRef<Language>(language);
  languageRef.current = language;
  const noticeTimerRef = useRef<number>(0);
  const lastStartedMatchKeyRef = useRef<string | null>(null);
  const activeModalRef = useRef<ActiveModal>('none');
  activeModalRef.current = activeModal;
  const customizeReturnTargetRef = useRef<
    'mobileSettings' | 'settings' | 'titleSettings'
  >('mobileSettings');

  const [isTouchHardware, setIsTouchHardware] = useState<boolean>(() =>
    detectTouchDevice(),
  );
  const [mobileSettings, setMobileSettings] = useState<MobileControlSettings>(() =>
    loadMobileSettings(),
  );
  const [extendedSettings, setExtendedSettings] = useState<ExtendedGameSettings>(
    () => loadExtendedSettings(),
  );
  const [settings, setSettings] = useState<GameSettings>(() => {
    const ext = loadExtendedSettings();
    return {
      mouseSensitivity: ext.camera.sensitivity,
      muted: ext.audio.muted,
      invertY: ext.camera.invertY,
    };
  });
  const [graphicsSettings, setGraphicsSettings] = useState<GraphicsSettings>(() =>
    loadGraphicsSettings(),
  );
  const [resolvedGraphicsProfile, setResolvedGraphicsProfile] =
    useState<ResolvedGraphicsProfile | null>(null);
  const [debugOverlayOpen, setDebugOverlayOpen] = useState(false);
  const [debugPerfSnapshot, setDebugPerfSnapshot] =
    useState<DebugPerformanceSnapshot | null>(null);
  const [liveFps, setLiveFps] = useState(60);

  const showMobileControls = shouldShowMobileControls(
    mobileSettings,
    isTouchHardware,
  );

  // Reliably detect touch devices at startup and on first real touch/pointer interaction
  useEffect(() => {
    const updateFromMedia = () => {
      if (detectTouchDevice()) {
        setIsTouchHardware(true);
      }
    };
    const onTouchStart = () => {
      setIsTouchHardware(true);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        setIsTouchHardware(true);
      }
    };

    const mqCoarse = window.matchMedia?.('(pointer: coarse)');
    const mqAnyCoarse = window.matchMedia?.('(any-pointer: coarse)');
    mqCoarse?.addEventListener?.('change', updateFromMedia);
    mqAnyCoarse?.addEventListener?.('change', updateFromMedia);
    window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    window.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });

    return () => {
      mqCoarse?.removeEventListener?.('change', updateFromMedia);
      mqAnyCoarse?.removeEventListener?.('change', updateFromMedia);
      window.removeEventListener('touchstart', onTouchStart, { capture: true });
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
    };
  }, []);

  const showNotice = useCallback((msg: string) => {
    setWorldNotice(msg);
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setWorldNotice(null);
    }, 3400);
  }, []);

  const refreshSaveSlots = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setSaveSlots(engine.getSaveSlots());
    setSavedWorlds(engine.getSavedWorlds());
    setLatestSave(engine.getMostRecentSaveMeta());
  }, []);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const initialLang = loadSavedLanguage();
    const initialExt = loadExtendedSettings();
    const initialTouch = shouldShowMobileControls(
      loadMobileSettings(),
      detectTouchDevice(),
    );

    const engine = new GameEngine(
      mountEl,
      {
        onPhaseChange: (nextPhase) => {
          setPhase(nextPhase);
          refreshSaveSlots();
          if (nextPhase !== 'playing') {
            setDialogueSnapshot(null);
            engineRef.current?.endNpcDialogue();
            setActiveModal((curr) =>
              curr === 'mobileSettings' ||
              curr === 'graphicsSettings' ||
              curr === 'settings' ||
              curr === 'saveSlots' ||
              curr === 'customizeControls' ||
              (curr === 'map' && nextPhase === 'paused')
                ? curr
                : 'none',
            );
          }
        },
        onHudUpdate: (snapshot) => setHud(snapshot),
        onPointerLockChange: (locked) => setPointerLocked(locked),
        onLoadProgress: (progress, label) => {
          setLoadProgress(progress);
          setLoadLabel(label);
        },
        onInventoryToggle: () => {
          setActiveModal((prev) =>
            prev === 'dialogue' ? prev : prev === 'inventory' ? 'none' : 'inventory',
          );
        },
        onMapToggle: () => {
          setActiveModal((prev) =>
            prev === 'dialogue' ? prev : prev === 'map' ? 'none' : 'map',
          );
        },
        onQuestJournalToggle: () => {
          setActiveModal((prev) =>
            prev === 'dialogue'
              ? prev
              : prev === 'questJournal'
                ? 'none'
                : 'questJournal',
          );
        },
        onPauseToggleCloseOrResume: () => {
          engineRef.current?.endNpcDialogue();
          setDialogueSnapshot(null);
          setActiveModal('none');
        },
        onWorldNotice: showNotice,
        onInventoryChange: (snapshot) => setInventorySnapshot(snapshot),
        onDialogueChange: (snapshot) => {
          setDialogueSnapshot(snapshot);
          setActiveModal(snapshot ? 'dialogue' : 'none');
        },
        onDebugToggle: () => {
          setDebugOverlayOpen((prev) => !prev);
        },
        onDebugPerfUpdate: (snapshot) => {
          setDebugPerfSnapshot(snapshot);
        },
        onGraphicsProfileChange: (profile) => {
          setResolvedGraphicsProfile(profile);
        },
        onChatToggle: () => {
          setActiveModal((prev) =>
            prev === 'dialogue' ? prev : prev === 'chat' ? 'none' : 'chat',
          );
        },
      },
      { language: initialLang, touchMode: initialTouch },
    );
    engineRef.current = engine;
    engine.setMultiplayerService(multiplayerServiceRef.current);
    engine.applyExtendedSettings(initialExt);
    applyAccessibilityDocumentAttributes(initialExt.accessibility);
    refreshSaveSlots();

    return () => {
      window.clearTimeout(noticeTimerRef.current);
      void ProfileManager.flushStatsDelta();
      engine.dispose();
      engineRef.current = null;
    };
  }, [showNotice, refreshSaveSlots]);

  // Bootstrap persistent player profile & flush stats cleanly on page unload
  useEffect(() => {
    void ProfileManager.bootstrap();
    const unsubProfile = ProfileManager.subscribe((snap) => {
      const showNames = snap.profile?.privacy.showPlayerName;
      if (typeof showNames === 'boolean') {
        setExtendedSettings((prev) => {
          if (prev.gameplay.showPlayerNames === showNames) return prev;
          const next: ExtendedGameSettings = {
            ...prev,
            gameplay: { ...prev.gameplay, showPlayerNames: showNames },
          };
          saveExtendedSettings(next);
          engineRef.current?.applyExtendedSettings(next);
          return next;
        });
      }
    });
    const onUnload = () => {
      void ProfileManager.flushStatsDelta();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      unsubProfile();
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

  // Sync language with <html lang> & engine
  useEffect(() => {
    document.documentElement.lang = language;
    engineRef.current?.setLanguage(language);
  }, [language]);

  // Sync accessibility attributes on <html> whenever extended settings update
  useEffect(() => {
    applyAccessibilityDocumentAttributes(extendedSettings.accessibility);
  }, [extendedSettings.accessibility]);

  // Keep React extendedSettings.camera.perspective synced with engine HUD snapshot (e.g. KeyV or loaded save)
  useEffect(() => {
    if (!hud.cameraPerspective) return;
    setExtendedSettings((prev) => {
      if (prev.camera.perspective === hud.cameraPerspective) return prev;
      return {
        ...prev,
        camera: {
          ...prev.camera,
          perspective: hud.cameraPerspective!,
        },
      };
    });
  }, [hud.cameraPerspective]);

  // Lightweight live FPS polling only when user enabled "Show FPS Counter"
  useEffect(() => {
    if (!extendedSettings.gameplay.showFps || phase !== 'playing') return;
    const id = window.setInterval(() => {
      if (engineRef.current) {
        setLiveFps(engineRef.current.getCurrentFps());
      }
    }, 350);
    return () => window.clearInterval(id);
  }, [extendedSettings.gameplay.showFps, phase]);

  // Sync mobile touch mode, mobile settings, and modal pause state with engine
  useEffect(() => {
    engineRef.current?.setTouchMode(showMobileControls);
    engineRef.current?.updateMobileSettings(mobileSettings);
  }, [showMobileControls, mobileSettings, phase]);

  useEffect(() => {
    engineRef.current?.setModalOpen(activeModal !== 'none');
    if (activeModal === 'chat') {
      setUnreadChatCount(0);
    }
  }, [activeModal]);

  useEffect(() => {
    engineRef.current?.setDebugOverlayEnabled(debugOverlayOpen);
  }, [debugOverlayOpen]);

  // Gamepad Start button toggles Pause during gameplay/paused states
  useGamepadPauseButton(
    (phase === 'playing' || phase === 'paused') && activeModal === 'none',
    () => {
      if (phase === 'playing') {
        engineRef.current?.pauseGame();
      } else if (phase === 'paused') {
        engineRef.current?.resumeGame();
      }
    },
  );

  // Native Android back-button handler invoked by MainActivity via Capacitor bridge
  useEffect(() => {
    window.__handleAndroidBack = () => {
      if (activeModal === 'dialogue') {
        engineRef.current?.sound.playUiClick();
        engineRef.current?.endNpcDialogue();
        return true;
      }
      if (activeModal === 'customizeControls') {
        engineRef.current?.sound.playUiClick();
        setMobileSettings((curr) => {
          saveMobileSettings(curr);
          return curr;
        });
        if (customizeReturnTargetRef.current === 'titleSettings') {
          setActiveModal('none');
          setTitleSubScreen('settings');
        } else {
          setActiveModal(customizeReturnTargetRef.current);
        }
        return true;
      }
      if (activeModal !== 'none') {
        engineRef.current?.sound.playUiClick();
        setActiveModal('none');
        return true;
      }
      if (phase === 'title' && titleSubScreen !== 'main') {
        engineRef.current?.sound.playUiClick();
        setTitleSubScreen('main');
        return true;
      }
      if (debugOverlayOpen) {
        setDebugOverlayOpen(false);
        return true;
      }
      if (phase === 'playing') {
        engineRef.current?.pauseGame();
        return true;
      }
      if (phase === 'paused') {
        engineRef.current?.resumeGame();
        return true;
      }
      return false;
    };

    return () => {
      delete window.__handleAndroidBack;
    };
  }, [activeModal, debugOverlayOpen, phase, titleSubScreen]);

  // Clean up initial /join/ROOM_ID or ?join=ROOM_ID URL and listen for Android deep links
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const initialTarget = extractJoinTargetFromUrl(window.location.href);
      if (initialTarget) {
        try {
          const parsed = new URL(window.location.href);
          if (parsed.searchParams.has('join') || /\/join\//i.test(parsed.pathname)) {
            window.history.replaceState({}, document.title, '/');
          }
        } catch {
          // Ignore history replacement errors on custom schemes
        }
      }
    }

    window.__handleMultiplayerJoinLink = (incomingUrl: string) => {
      const target = extractJoinTargetFromUrl(incomingUrl);
      if (!target) return;
      setPendingJoinCode(target);
      if (phase === 'playing' || phase === 'paused') {
        engineRef.current?.returnToMainMenu();
      }
      setActiveModal('none');
      setTitleSubScreen('multiplayer');
    };

    return () => {
      delete window.__handleMultiplayerJoinLink;
    };
  }, [phase]);

  // Poll for incoming friend room invitations when multiplayer backend is configured
  useEffect(() => {
    const svc = multiplayerServiceRef.current;
    if (!svc || !svc.isConfigured()) return;

    const unsub = svc.subscribe((ev) => {
      if (ev.type === 'invite-received') {
        setIncomingInvite(ev.invite);
      }
    });

    const activeName = loadSavedMultiplayerName(
      language === 'ar' ? 'مغامر' : 'Adventurer',
    );
    svc.startInvitePolling(activeName);

    return () => {
      unsub();
      svc.stopInvitePolling();
    };
  }, [language, titleSubScreen]);

  const handleToggleLanguage = useCallback(() => {
    engineRef.current?.sound.playUiClick();
    setLanguage((prev) => {
      const next: Language = prev === 'en' ? 'ar' : 'en';
      saveLanguage(next);
      return next;
    });
  }, []);

  const handleContinue = useCallback(() => {
    setActiveModal('none');
    setTitleSubScreen('main');
    engineRef.current?.setModalOpen(false);
    const ok = engineRef.current?.continueLatestSave();
    if (!ok) {
      setTitleSubScreen('newWorld');
    } else {
      setWaypoint(engineRef.current?.getWaypoint() ?? null);
    }
    refreshSaveSlots();
  }, [refreshSaveSlots]);

  const handleCreateWorld = useCallback(
    (options: NewWorldOptions) => {
      setActiveModal('none');
      setTitleSubScreen('main');
      engineRef.current?.setModalOpen(false);
      engineRef.current?.createNewWorld(options);
      setWaypoint(engineRef.current?.getWaypoint() ?? null);
      refreshSaveSlots();
    },
    [refreshSaveSlots],
  );

  const handleStartMultiplayerWorld = useCallback(
    (info: MultiplayerGameStartInfo) => {
      const matchKey = `${info.roomId}:${info.seed}`;
      if (lastStartedMatchKeyRef.current === matchKey) {
        return;
      }
      lastStartedMatchKeyRef.current = matchKey;
      const authType = info.worldSettings?.worldType ?? info.worldType;
      const authDifficulty = info.worldSettings?.difficulty ?? info.difficulty;
      setActiveModal('none');
      setTitleSubScreen('main');
      engineRef.current?.setModalOpen(false);
      engineRef.current?.setMultiplayerService(multiplayerServiceRef.current);
      engineRef.current?.startMultiplayerWorld({
        worldName: info.worldName || info.roomName,
        seed: info.seed,
        worldType: authType,
        difficulty: authDifficulty,
        localPlayerId: info.localPlayerId,
        players: info.players,
      });
      setWaypoint(engineRef.current?.getWaypoint() ?? null);
      const t = UI_TEXT[language];
      const modeLabel =
        authType === 'survival'
          ? t.worldTypeSurvival
          : authType === 'adventure'
            ? t.worldTypeAdventure
            : authType === 'creative'
              ? t.worldTypeCreative
              : t.worldTypeNormal;
      showNotice(t.mpStartingWorldNotice(info.roomCode || info.roomId, modeLabel));
    },
    [language, showNotice],
  );

  // Root-level multiplayer match transition, room snapshot, connection resilience & unread chat listener
  useEffect(() => {
    const svc = multiplayerServiceRef.current;
    if (!svc) return;
    setActiveMpRoom(svc.getRoomState());
    setMpConnectionState(svc.getConnectionState());
    setMpReconnectAttempt(svc.getReconnectAttempt());
    return svc.subscribe((ev) => {
      if (ev.type === 'connection-changed') {
        setMpConnectionState(ev.state);
        setMpReconnectAttempt(ev.attempt ?? svc.getReconnectAttempt());
      } else if (ev.type === 'game-started') {
        setUnreadChatCount(0);
        handleStartMultiplayerWorld(ev.info);
      } else if (ev.type === 'room-updated') {
        setActiveMpRoom(ev.room);
        void ProfileManager.updatePresence({
          currentRoomId: ev.room?.roomId ?? null,
          currentRoomName: ev.room?.roomName ?? null,
        });
      } else if (ev.type === 'host-transferred') {
        if (engineRef.current?.isMultiplayerSession()) {
          showNotice(
            UI_TEXT[languageRef.current].mpHostTransferredNotice(ev.newHostName),
          );
        }
      } else if (ev.type === 'room-closed') {
        const wasInGame = Boolean(engineRef.current?.isMultiplayerSession());
        lastStartedMatchKeyRef.current = null;
        setActiveMpRoom(null);
        setUnreadChatCount(0);
        setMpConnectionState('disconnected');
        setMpReconnectAttempt(0);
        if (wasInGame) {
          setActiveModal('none');
          setTitleSubScreen('multiplayer');
          engineRef.current?.returnToMainMenu();
          refreshSaveSlots();
          showNotice(UI_TEXT[languageRef.current].mpRoomClosedReturnNotice);
        }
      } else if (ev.type === 'player-kicked' && ev.isLocalTarget) {
        const wasInGame = Boolean(engineRef.current?.isMultiplayerSession());
        lastStartedMatchKeyRef.current = null;
        setActiveMpRoom(null);
        setUnreadChatCount(0);
        setMpConnectionState('disconnected');
        setMpReconnectAttempt(0);
        if (wasInGame) {
          setActiveModal('none');
          setTitleSubScreen('multiplayer');
          engineRef.current?.returnToMainMenu();
          refreshSaveSlots();
          showNotice(UI_TEXT[languageRef.current].mpKickedNotice);
        }
      } else if (ev.type === 'chat-message') {
        const localId = svc.getLocalPlayerId();
        const isMutedOrBlocked =
          svc.isPlayerMuted(ev.message.playerId, ev.message.playerName) ||
          svc.isPlayerBlocked(ev.message.playerId, ev.message.playerName);
        if (
          activeModalRef.current !== 'chat' &&
          !isMutedOrBlocked &&
          ev.message.playerId !== localId
        ) {
          setUnreadChatCount((c) => Math.min(99, c + 1));
        }
      }
    });
  }, [handleStartMultiplayerWorld, refreshSaveSlots, showNotice]);

  const handleOpenSaveSlots = useCallback(() => {
    engineRef.current?.sound.playUiClick();
    refreshSaveSlots();
    setActiveModal('saveSlots');
  }, [refreshSaveSlots]);

  const handleQuickSave = useCallback(() => {
    engineRef.current?.saveCurrentWorld(false);
    refreshSaveSlots();
  }, [refreshSaveSlots]);

  const handleSaveSlot = useCallback(
    (slotId: SaveSlotId) => {
      engineRef.current?.saveToSlot(slotId, false);
      refreshSaveSlots();
    },
    [refreshSaveSlots],
  );

  const handleLoadSlot = useCallback(
    (slotId: SaveSlotId) => {
      setActiveModal('none');
      setTitleSubScreen('main');
      engineRef.current?.setModalOpen(false);
      engineRef.current?.loadFromSlot(slotId);
      setWaypoint(engineRef.current?.getWaypoint() ?? null);
      refreshSaveSlots();
    },
    [refreshSaveSlots],
  );

  const handleDeleteSlot = useCallback(
    (slotId: SaveSlotId) => {
      engineRef.current?.deleteSaveSlot(slotId);
      refreshSaveSlots();
    },
    [refreshSaveSlots],
  );

  const handleResume = useCallback(() => {
    setActiveModal('none');
    engineRef.current?.resumeGame();
  }, []);

  const handlePause = useCallback(() => {
    if (hud.isSleeping) return;
    setActiveModal('none');
    engineRef.current?.pauseGame();
  }, [hud.isSleeping]);

  const handleExitMultiplayerToMenu = useCallback(() => {
    void multiplayerServiceRef.current?.leaveRoom().catch(() => {
      // Ignore network errors while exiting back to multiplayer menu
    });
    lastStartedMatchKeyRef.current = null;
    setActiveMpRoom(null);
    setUnreadChatCount(0);
    setMpConnectionState('disconnected');
    setMpReconnectAttempt(0);
    setActiveModal('none');
    setTitleSubScreen('multiplayer');
    engineRef.current?.returnToMainMenu();
    refreshSaveSlots();
  }, [refreshSaveSlots]);

  const handleReturnToMainMenu = useCallback(
    (saveFirst: boolean) => {
      if (saveFirst && !engineRef.current?.isMultiplayerSession()) {
        engineRef.current?.saveCurrentWorld(false);
      }
      if (engineRef.current?.isMultiplayerSession()) {
        void multiplayerServiceRef.current?.leaveRoom().catch(() => {
          // Ignore network errors when leaving room cleanly
        });
        void ProfileManager.updatePresence({
          currentRoomId: null,
          currentRoomName: null,
        });
      }
      void ProfileManager.flushStatsDelta();
      lastStartedMatchKeyRef.current = null;
      setActiveModal('none');
      setTitleSubScreen('main');
      engineRef.current?.returnToMainMenu();
      refreshSaveSlots();
    },
    [refreshSaveSlots],
  );

  const handleResetPosition = useCallback(() => {
    setActiveModal('none');
    engineRef.current?.resetPlayerPosition();
    engineRef.current?.resumeGame();
  }, []);

  const handleUpdateSettings = useCallback((partial: Partial<GameSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      engineRef.current?.updateSettings(next);
      return next;
    });
    if (
      partial.muted !== undefined ||
      partial.mouseSensitivity !== undefined ||
      partial.invertY !== undefined
    ) {
      setExtendedSettings((prev) => {
        const nextExt: ExtendedGameSettings = {
          ...prev,
          audio: {
            ...prev.audio,
            ...(partial.muted !== undefined ? { muted: partial.muted } : {}),
          },
          camera: {
            ...prev.camera,
            ...(partial.mouseSensitivity !== undefined
              ? { sensitivity: partial.mouseSensitivity }
              : {}),
            ...(partial.invertY !== undefined
              ? { invertY: partial.invertY }
              : {}),
          },
        };
        saveExtendedSettings(nextExt);
        return nextExt;
      });
    }
  }, []);

  const handleUpdateGraphicsSettings = useCallback(
    (partial: Partial<GraphicsSettings>) => {
      engineRef.current?.sound.playUiClick();
      const nextProfile = engineRef.current?.updateGraphicsSettings(partial);
      const nextSettings = engineRef.current?.getGraphicsSettings();
      if (nextSettings) {
        setGraphicsSettings(nextSettings);
        saveGraphicsSettings(nextSettings);
      } else {
        setGraphicsSettings((prev) => {
          const merged = { ...prev, ...partial };
          saveGraphicsSettings(merged);
          return merged;
        });
      }
      if (nextProfile) {
        setResolvedGraphicsProfile(nextProfile);
      }
    },
    [],
  );

  const handleResetGraphicsAuto = useCallback(() => {
    engineRef.current?.sound.playUiClick();
    const nextProfile = engineRef.current?.resetGraphicsSettings();
    const nextSettings = engineRef.current?.getGraphicsSettings();
    if (nextSettings) setGraphicsSettings(nextSettings);
    if (nextProfile) setResolvedGraphicsProfile(nextProfile);
  }, []);

  const handleApplyExtendedSettings = useCallback(
    (payload: {
      lang: Language;
      graphics: GraphicsSettings;
      extended: ExtendedGameSettings;
      game: GameSettings;
      mobile: MobileControlSettings;
    }) => {
      engineRef.current?.sound.playUiClick();

      setLanguage(payload.lang);
      saveLanguage(payload.lang);

      handleUpdateGraphicsSettings(payload.graphics);

      setExtendedSettings(payload.extended);
      saveExtendedSettings(payload.extended);
      applyAccessibilityDocumentAttributes(payload.extended.accessibility);
      engineRef.current?.applyExtendedSettings(payload.extended);
      if (ProfileManager.hasProfile()) {
        void ProfileManager.updateProfile({
          privacy: { showPlayerName: payload.extended.gameplay.showPlayerNames },
        });
      }

      setSettings(payload.game);
      engineRef.current?.updateSettings(payload.game);

      setMobileSettings(payload.mobile);
      saveMobileSettings(payload.mobile);

      showNotice(UI_TEXT[payload.lang].settingsAppliedNotice);
    },
    [handleUpdateGraphicsSettings, showNotice],
  );

  const handleResetAllSettings = useCallback(() => {
    engineRef.current?.sound.playUiClick();
    const defExt = createDefaultExtendedSettings();
    const defGame: GameSettings = {
      mouseSensitivity: 1.0,
      muted: false,
      invertY: false,
    };
    const defMobile: MobileControlSettings = { ...DEFAULT_MOBILE_SETTINGS };

    const nextProfile = engineRef.current?.resetGraphicsSettings();
    const nextGfx = engineRef.current?.getGraphicsSettings();
    if (nextGfx) setGraphicsSettings(nextGfx);
    if (nextProfile) setResolvedGraphicsProfile(nextProfile);

    setExtendedSettings(defExt);
    saveExtendedSettings(defExt);
    applyAccessibilityDocumentAttributes(defExt.accessibility);
    engineRef.current?.applyExtendedSettings(defExt);

    setSettings(defGame);
    engineRef.current?.updateSettings(defGame);

    setMobileSettings(defMobile);
    saveMobileSettings(defMobile);
  }, []);

  const handleUpdateMobileSettings = useCallback((next: MobileControlSettings) => {
    setMobileSettings(next);
    saveMobileSettings(next);
  }, []);

  const handleOpenCustomizeControls = useCallback(
    (returnTarget: 'mobileSettings' | 'settings' | 'titleSettings' = 'mobileSettings') => {
      engineRef.current?.sound.playUiClick();
      customizeReturnTargetRef.current = returnTarget;
      if (returnTarget === 'titleSettings') {
        setTitleSubScreen('main');
      }
      setActiveModal('customizeControls');
    },
    [],
  );

  const handleExitCustomizeControls = useCallback(() => {
    engineRef.current?.sound.playUiClick();
    setMobileSettings((curr) => {
      saveMobileSettings(curr);
      return curr;
    });
    if (customizeReturnTargetRef.current === 'titleSettings') {
      setActiveModal('none');
      setTitleSubScreen('settings');
    } else {
      setActiveModal(customizeReturnTargetRef.current);
    }
  }, []);

  const handleSaveMobileSettingsAndClose = useCallback(() => {
    engineRef.current?.sound.playUiClick();
    setMobileSettings((curr) => {
      saveMobileSettings(curr);
      return curr;
    });
    showNotice(UI_TEXT[language].settingsSavedNotice);
    setActiveModal('none');
  }, [language, showNotice]);

  const handleToggleMute = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, muted: !prev.muted };
      engineRef.current?.sound.unlock();
      engineRef.current?.updateSettings(next);
      setExtendedSettings((prevExt) => {
        const nextExt: ExtendedGameSettings = {
          ...prevExt,
          audio: { ...prevExt.audio, muted: next.muted },
        };
        saveExtendedSettings(nextExt);
        return nextExt;
      });
      return next;
    });
  }, []);

  const handleOpenInventory = useCallback(() => {
    if (hud.isSleeping) return;
    engineRef.current?.sound.playUiClick();
    setActiveModal((prev) => (prev === 'inventory' ? 'none' : 'inventory'));
  }, [hud.isSleeping]);

  const handleOpenMap = useCallback(() => {
    if (hud.isSleeping) return;
    engineRef.current?.sound.playUiClick();
    setActiveModal((prev) => (prev === 'map' ? 'none' : 'map'));
  }, [hud.isSleeping]);

  const handleSetWaypoint = useCallback((wp: MapWaypoint) => {
    engineRef.current?.setWaypoint(wp);
    setWaypoint(engineRef.current?.getWaypoint() ?? wp);
  }, []);

  const handleClearWaypoint = useCallback(() => {
    engineRef.current?.clearWaypoint();
    setWaypoint(null);
  }, []);

  const handleToggleMiniMapRotate = useCallback(() => {
    engineRef.current?.sound.playUiClick();
    setExtendedSettings((prev) => {
      const next: ExtendedGameSettings = {
        ...prev,
        gameplay: {
          ...prev.gameplay,
          miniMapRotate: !prev.gameplay.miniMapRotate,
        },
      };
      saveExtendedSettings(next);
      engineRef.current?.applyExtendedSettings(next);
      return next;
    });
  }, []);

  const handleOpenQuestJournal = useCallback(() => {
    if (hud.isSleeping) return;
    engineRef.current?.sound.playUiClick();
    setActiveModal((prev) =>
      prev === 'questJournal' ? 'none' : 'questJournal',
    );
  }, [hud.isSleeping]);

  const handleTrackQuest = useCallback((questId: string) => {
    engineRef.current?.sound.playUiClick();
    engineRef.current?.setTrackedQuest(questId);
  }, []);

  const handleCloseDialogue = useCallback(() => {
    engineRef.current?.sound.playUiClick();
    engineRef.current?.endNpcDialogue();
  }, []);

  const handleNextDialogue = useCallback(() => {
    engineRef.current?.advanceDialogue();
  }, []);

  const handleSelectDialogueChoice = useCallback((choiceId: string) => {
    engineRef.current?.selectDialogueChoice(choiceId);
  }, []);

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#0d1712]">
      {/* Isolated WebGL canvas mount so React state updates never recreate the 3D scene */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full touch-action-none" />

      {phase === 'loading' && (
        <LoadingScreen
          progress={loadProgress}
          statusLabel={loadLabel}
          lang={language}
        />
      )}

      {phase === 'title' && activeModal !== 'customizeControls' && (
        <TitleScreen
          lang={language}
          subScreen={titleSubScreen}
          latestSave={latestSave}
          savedWorlds={savedWorlds}
          showMobileControls={showMobileControls}
          muted={settings.muted}
          graphicsSettings={graphicsSettings}
          extendedSettings={extendedSettings}
          gameSettings={settings}
          mobileSettings={mobileSettings}
          onChangeSubScreen={(next) => {
            engineRef.current?.sound.playUiClick();
            refreshSaveSlots();
            setTitleSubScreen(next);
          }}
          onToggleLanguage={handleToggleLanguage}
          onToggleMute={handleToggleMute}
          onContinue={handleContinue}
          onCreateWorld={handleCreateWorld}
          onPlayWorld={handleLoadSlot}
          onDeleteWorld={handleDeleteSlot}
          onApplySettings={handleApplyExtendedSettings}
          onResetAllSettings={handleResetAllSettings}
          onOpenCustomizeControls={() =>
            handleOpenCustomizeControls('titleSettings')
          }
          multiplayerService={multiplayerServiceRef.current}
          initialJoinCode={pendingJoinCode}
          onConsumeInitialJoinCode={() => setPendingJoinCode(null)}
          onStartMultiplayerWorld={handleStartMultiplayerWorld}
          onOpenProfile={() => {
            engineRef.current?.sound.playUiClick();
            if (ProfileManager.hasProfile()) {
              setProfileModalOpen(true);
            } else {
              setProfileSetupOpen(true);
            }
          }}
        />
      )}

      {(phase === 'playing' || activeModal === 'customizeControls') && (
        <>
          <HudOverlay
            hud={hud}
            pointerLocked={pointerLocked}
            muted={settings.muted}
            showMobileControls={
              showMobileControls || activeModal === 'customizeControls'
            }
            customizeMode={activeModal === 'customizeControls'}
            worldNotice={worldNotice}
            lang={language}
            showHud={extendedSettings.gameplay.showHud}
            showFps={extendedSettings.gameplay.showFps}
            showBiomeDebug={extendedSettings.gameplay.showBiomeDebug}
            fps={liveFps}
            mapManager={engineRef.current?.mapManager ?? null}
            mapData={engineRef.current?.getMapData() ?? null}
            waypoint={waypoint}
            miniMapRotate={extendedSettings.gameplay.miniMapRotate}
            onToggleMute={handleToggleMute}
            onPause={handlePause}
            onOpenInventory={handleOpenInventory}
            onOpenMap={handleOpenMap}
            onOpenQuestJournal={handleOpenQuestJournal}
            onSelectWeaponSlot={(slotIndex) =>
              engineRef.current?.useInventorySlot(slotIndex)
            }
            onUnequipWeapon={() => engineRef.current?.unequipWeapon()}
            onJumpToTimePreset={(preset) =>
              engineRef.current?.jumpToTimePreset(preset)
            }
            onSetDayDuration={(sec) =>
              engineRef.current?.setFullDayDurationSeconds(sec)
            }
            onSetTimeScale={(scale) =>
              engineRef.current?.setTimeScale(scale)
            }
            onToggleTimePaused={(paused) =>
              engineRef.current?.setTimePaused(paused)
            }
            onSetWeatherState={(state) =>
              engineRef.current?.setWeatherState(state)
            }
            onSetWeatherDynamic={(enabled) =>
              engineRef.current?.setWeatherDynamic(enabled)
            }
            onSetWeatherTransitionDuration={(sec) =>
              engineRef.current?.setWeatherTransitionDuration(sec)
            }
            onSetWeatherQuality={(quality) =>
              engineRef.current?.setWeatherQuality(quality)
            }
            onTriggerLightning={() =>
              engineRef.current?.triggerLightningStrike()
            }
            onCycleCameraPerspective={() =>
              engineRef.current?.cycleCameraPerspective()
            }
            isMultiplayer={Boolean(engineRef.current?.isMultiplayerSession() || activeMpRoom)}
            unreadChatCount={unreadChatCount}
            onOpenChat={() => {
              if (hud.isSleeping) return;
              engineRef.current?.sound.playUiClick();
              setActiveModal((prev) => (prev === 'chat' ? 'none' : 'chat'));
            }}
          />

          {((showMobileControls && activeModal === 'none') ||
            activeModal === 'customizeControls') && (
            <MobileControlsOverlay
              mobileInput={engineRef.current?.getMobileInput() ?? null}
              settings={mobileSettings}
              grounded={hud.grounded}
              nearbyInteractable={hud.nearbyInteractable}
              lang={language}
              customizeMode={activeModal === 'customizeControls'}
              equippedWeaponIsRanged={Boolean(hud.equippedWeapon?.isRanged)}
              bowChargeProgress={hud.isChargingBow ? (hud.bowChargeProgress ?? 0) : 0}
              cameraPerspective={hud.cameraPerspective}
              onUpdateSettings={handleUpdateMobileSettings}
              onExitCustomize={handleExitCustomizeControls}
              onPause={handlePause}
              onOpenInventory={handleOpenInventory}
              onOpenMap={handleOpenMap}
              onOpenQuestJournal={handleOpenQuestJournal}
              onCycleCameraPerspective={() =>
                engineRef.current?.cycleCameraPerspective()
              }
            />
          )}

          {activeModal === 'inventory' && (
            <InventoryModal
              snapshot={inventorySnapshot}
              quests={engineRef.current?.getJournalQuests() ?? []}
              craftRecipes={engineRef.current?.getCraftingRecipes() ?? []}
              lang={language}
              onUseSlot={(slotIndex) => engineRef.current?.useInventorySlot(slotIndex)}
              onDropSlot={(slotIndex, count) =>
                engineRef.current?.dropInventorySlot(slotIndex, count)
              }
              onCraftRecipe={(recipeId) => engineRef.current?.craftRecipe(recipeId)}
              onClose={() => setActiveModal('none')}
            />
          )}

          {activeModal === 'questJournal' && (
            <QuestJournalModal
              activeQuests={
                engineRef.current?.getQuestJournalData().active ?? []
              }
              completedQuests={
                engineRef.current?.getQuestJournalData().completed ?? []
              }
              availableQuests={
                engineRef.current?.getQuestJournalData().available ?? []
              }
              level={hud.level}
              xp={hud.xp}
              xpToNextLevel={hud.xpToNextLevel}
              coins={hud.coins}
              lang={language}
              onTrackQuest={handleTrackQuest}
              onClose={() => setActiveModal('none')}
            />
          )}

          {activeModal === 'dialogue' && dialogueSnapshot && (
            <DialogueModal
              snapshot={dialogueSnapshot}
              lang={language}
              aiService={engineRef.current?.aiService ?? null}
              getAiWorldContext={() =>
                engineRef.current?.getAiWorldContext() ?? {
                  biome: hud.biome,
                  timeOfDay: hud.timeOfDayLabel,
                  weather: hud.weatherSnapshot?.currentState ?? 'clear',
                  playerLevel: hud.level,
                  activeQuests: [],
                  completedQuests: [],
                }
              }
              onNext={handleNextDialogue}
              onSelectChoice={handleSelectDialogueChoice}
              onClose={handleCloseDialogue}
            />
          )}
        </>
      )}

      {(phase === 'playing' || phase === 'paused') && activeModal === 'map' && (
        <WorldMapModal
          playerX={hud.x}
          playerZ={hud.z}
          headingDeg={hud.headingDeg}
          biome={hud.biome}
          mapManager={engineRef.current?.mapManager ?? null}
          mapData={engineRef.current?.getMapData() ?? null}
          waypoint={waypoint}
          miniMapRotate={extendedSettings.gameplay.miniMapRotate}
          lang={language}
          onSetWaypoint={handleSetWaypoint}
          onClearWaypoint={handleClearWaypoint}
          onToggleMiniMapRotate={handleToggleMiniMapRotate}
          onClose={() => setActiveModal('none')}
        />
      )}

      {(phase === 'playing' || phase === 'paused') &&
        activeModal === 'chat' &&
        multiplayerServiceRef.current && (
          <InGameMultiplayerChatModal
            lang={language}
            service={multiplayerServiceRef.current}
            room={activeMpRoom ?? multiplayerServiceRef.current.getRoomState()}
            onClose={() => setActiveModal('none')}
            onNotice={showNotice}
          />
        )}

      {phase === 'paused' &&
        activeModal !== 'mobileSettings' &&
        activeModal !== 'graphicsSettings' &&
        activeModal !== 'settings' &&
        activeModal !== 'saveSlots' &&
        activeModal !== 'customizeControls' &&
        activeModal !== 'map' && (
          <PauseMenu
            settings={settings}
            showMobileControls={showMobileControls}
            lang={language}
            activeWorldName={
              engineRef.current?.getActiveWorldMeta().worldName ??
              UI_TEXT[language].gameTitle
            }
            hasUnsavedProgress={
              engineRef.current?.getHasUnsavedProgress() ?? false
            }
            timeSnapshot={hud.timeSnapshot}
            weatherSnapshot={hud.weatherSnapshot}
            onToggleLanguage={handleToggleLanguage}
            onResume={handleResume}
            onOpenMap={handleOpenMap}
            onSaveWorld={handleQuickSave}
            onOpenSettings={() => {
              engineRef.current?.sound.playUiClick();
              setActiveModal('settings');
            }}
            onReturnToMainMenu={handleReturnToMainMenu}
            onResetPosition={handleResetPosition}
            onOpenSaveSlots={handleOpenSaveSlots}
            onUpdateSettings={handleUpdateSettings}
            onOpenGraphicsSettings={() => {
              engineRef.current?.sound.playUiClick();
              setActiveModal('graphicsSettings');
            }}
            graphicsSummaryLabel={
              resolvedGraphicsProfile
                ? (() => {
                    const t = UI_TEXT[language];
                    const tier = resolvedGraphicsProfile.effectiveTier;
                    const tierText =
                      tier === 'very-low'
                        ? t.tierVeryLow
                        : tier === 'low'
                          ? t.tierLow
                          : tier === 'medium'
                            ? t.tierMedium
                            : tier === 'high'
                              ? t.tierHigh
                              : t.tierUltra;
                    return graphicsSettings.preset === 'auto'
                      ? `${t.tierAuto} · ${tierText}`
                      : tierText;
                  })()
                : undefined
            }
            onOpenMobileSettings={() => setActiveModal('mobileSettings')}
            onJumpToTimePreset={(preset) =>
              engineRef.current?.jumpToTimePreset(preset)
            }
            onSetDayDuration={(sec) =>
              engineRef.current?.setFullDayDurationSeconds(sec)
            }
            onSetWeatherState={(state) =>
              engineRef.current?.setWeatherState(state)
            }
            onSetWeatherDynamic={(enabled) =>
              engineRef.current?.setWeatherDynamic(enabled)
            }
            onSetWeatherTransitionDuration={(sec) =>
              engineRef.current?.setWeatherTransitionDuration(sec)
            }
            onSetWeatherQuality={(quality) =>
              engineRef.current?.setWeatherQuality(quality)
            }
          />
        )}

      {activeModal === 'settings' && (
        <SettingsScreen
          lang={language}
          graphicsSettings={graphicsSettings}
          extendedSettings={extendedSettings}
          gameSettings={settings}
          mobileSettings={mobileSettings}
          showMobileControls={showMobileControls}
          onApply={handleApplyExtendedSettings}
          onResetAll={handleResetAllSettings}
          onOpenCustomizeControls={() => handleOpenCustomizeControls('settings')}
          onBack={() => {
            engineRef.current?.sound.playUiClick();
            setActiveModal('none');
          }}
        />
      )}

      {activeModal === 'graphicsSettings' &&
        (resolvedGraphicsProfile ||
          engineRef.current?.getResolvedGraphicsProfile()) && (
          <GraphicsSettingsModal
            settings={graphicsSettings}
            profile={
              (resolvedGraphicsProfile ??
                engineRef.current?.getResolvedGraphicsProfile())!
            }
            hardware={engineRef.current?.getHardwareCapabilities() ?? null}
            debugOverlayOpen={debugOverlayOpen}
            lang={language}
            onUpdate={handleUpdateGraphicsSettings}
            onResetAuto={handleResetGraphicsAuto}
            onToggleDebugOverlay={() => setDebugOverlayOpen((prev) => !prev)}
            onClose={() => {
              engineRef.current?.sound.playUiClick();
              setActiveModal('none');
            }}
          />
        )}

      {activeModal === 'saveSlots' && (
        <SaveSlotsModal
          slots={saveSlots}
          allowSave={phase === 'paused' || phase === 'playing'}
          lang={language}
          onSaveSlot={handleSaveSlot}
          onLoadSlot={handleLoadSlot}
          onDeleteSlot={handleDeleteSlot}
          onClose={() => setActiveModal('none')}
        />
      )}

      {activeModal === 'mobileSettings' && (
        <MobileSettingsModal
          settings={mobileSettings}
          isTouchHardware={isTouchHardware}
          lang={language}
          onChange={handleUpdateMobileSettings}
          onOpenCustomize={() => handleOpenCustomizeControls('mobileSettings')}
          onSaveAndClose={handleSaveMobileSettingsAndClose}
          onClose={() => setActiveModal('none')}
        />
      )}

      {debugOverlayOpen && debugPerfSnapshot && phase !== 'loading' && (
        <DebugPerformanceOverlay
          snapshot={debugPerfSnapshot}
          lang={language}
          onClose={() => setDebugOverlayOpen(false)}
        />
      )}

      {(phase === 'playing' || phase === 'paused') &&
        Boolean(engineRef.current?.isMultiplayerSession() || activeMpRoom) && (
          <ConnectionStatusBanner
            lang={language}
            connectionState={mpConnectionState}
            attempt={mpReconnectAttempt}
            maxAttempts={multiplayerServiceRef.current?.getMaxReconnectAttempts() ?? 6}
            variant="hud"
            onRetry={() => void multiplayerServiceRef.current?.retryReconnect()}
            onReturnToMenu={handleExitMultiplayerToMenu}
          />
        )}

      {phase !== 'playing' && worldNotice && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] pointer-events-none px-4 py-2 rounded-lg bg-[#101c16]/95 border border-[#355c47] text-xs font-medium text-[#eef5ec] shadow-xl">
          {worldNotice}
        </div>
      )}

      {incomingInvite && phase !== 'loading' && (
        <div
          role="status"
          dir={language === 'ar' ? 'rtl' : 'ltr'}
          data-testid="mp-invite-notification"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] w-[min(92vw,420px)] p-3.5 rounded-2xl bg-[#101c16]/96 border border-[#e5a93c]/60 text-[#f2f6ef] shadow-2xl backdrop-blur-md pointer-events-auto"
        >
          <div className="flex items-start gap-3">
            {incomingInvite.fromAvatar ? (
              <AvatarBadge
                avatar={incomingInvite.fromAvatar}
                seed={
                  incomingInvite.fromPublicProfileId ??
                  incomingInvite.fromPlayerName
                }
                displayName={incomingInvite.fromPlayerName}
                size="sm"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-[#20382b] border border-[#e5a93c]/40 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-[#e5a93c]" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold text-sm text-[#ffffff] leading-snug">
                {UI_TEXT[language].profileInviteToastText(
                  incomingInvite.fromPlayerName,
                  incomingInvite.fromPlayerTag ?? '',
                  incomingInvite.roomName,
                )}
              </div>
              <div className="text-xs text-[#9db1a1] mt-0.5 truncate">
                {incomingInvite.roomName} ·{' '}
                <span dir="ltr" className="font-mono-num text-[#e5a93c]">
                  {incomingInvite.roomCode}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2.5">
                <button
                  type="button"
                  disabled={acceptingInvite}
                  data-testid="mp-toast-accept-invite"
                  onClick={async () => {
                    const svc = multiplayerServiceRef.current;
                    if (!svc || acceptingInvite) return;
                    const t = UI_TEXT[language];
                    const name =
                      ProfileManager.getProfile()?.displayName ||
                      loadSavedMultiplayerName(
                        language === 'ar' ? 'مغامر' : 'Adventurer',
                      );
                    setAcceptingInvite(true);
                    try {
                      await svc.acceptInvite(incomingInvite.inviteId, name);
                      setIncomingInvite(null);
                      if (phase !== 'title') {
                        engineRef.current?.returnToMainMenu();
                      }
                      setActiveModal('none');
                      setTitleSubScreen('multiplayer');
                    } catch (err) {
                      setIncomingInvite(null);
                      const msg =
                        err && typeof err === 'object' && 'code' in err
                          ? (err as { code?: string }).code === 'ROOM_FULL'
                            ? t.mpErrorRoomFull
                            : (err as { code?: string }).code === 'GAME_ALREADY_STARTED'
                              ? t.mpErrorGameAlreadyStarted
                              : t.mpErrorRoomNotFound
                          : t.mpErrorRoomNotFound;
                      showNotice(msg);
                    } finally {
                      setAcceptingInvite(false);
                    }
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] disabled:opacity-60 text-[#111914] font-display font-bold text-xs cursor-pointer whitespace-nowrap"
                >
                  {UI_TEXT[language].mpAcceptBtn}
                </button>
                <button
                  type="button"
                  disabled={acceptingInvite}
                  data-testid="mp-toast-decline-invite"
                  onClick={async () => {
                    const invId = incomingInvite.inviteId;
                    setIncomingInvite(null);
                    await multiplayerServiceRef.current?.declineInvite(invId);
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#2f493b] text-xs font-semibold text-[#e4ece1] cursor-pointer whitespace-nowrap"
                >
                  {UI_TEXT[language].mpDeclineBtn}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {profileModalOpen && (
        <PlayerProfileModal
          lang={language}
          targetPublicProfileId={null}
          multiplayerService={multiplayerServiceRef.current}
          onClose={() => setProfileModalOpen(false)}
          onNotice={showNotice}
          onShowPlayerNamesChanged={(enabled) => {
            setExtendedSettings((prev) => {
              const next: ExtendedGameSettings = {
                ...prev,
                gameplay: { ...prev.gameplay, showPlayerNames: enabled },
              };
              saveExtendedSettings(next);
              engineRef.current?.applyExtendedSettings(next);
              return next;
            });
          }}
        />
      )}

      {profileSetupOpen && (
        <ProfileSetupModal
          lang={language}
          onComplete={() => {
            setProfileSetupOpen(false);
            setProfileModalOpen(true);
          }}
          onCancel={() => setProfileSetupOpen(false)}
        />
      )}
    </main>
  );
}
