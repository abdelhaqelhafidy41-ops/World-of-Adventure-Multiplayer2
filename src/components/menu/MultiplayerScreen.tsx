import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Compass,
  Copy,
  Crown,
  DoorOpen,
  Flame,
  Globe,
  Hammer,
  Info,
  Link2,
  Lock,
  Mail,
  MoreHorizontal,
  Play,
  PlusCircle,
  RefreshCw,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  VolumeX,
  Wifi,
  WifiOff,
  XCircle,
  Zap,
  Ban,
} from 'lucide-react';
import { UI_TEXT, type Language } from '../../game/i18n/translations';
import {
  createMultiplayerService,
  loadSavedMultiplayerName,
  saveMultiplayerName,
} from '../../game/multiplayer/MultiplayerService';
import {
  checkMultiplayerServerHealth,
  formatMultiplayerDiagnosticReport,
  getMultiplayerConfig,
} from '../../game/multiplayer/multiplayerConfig';
import {
  buildRoomShareLink,
  copyTextToClipboard,
  extractJoinTargetFromUrl,
  shareRoomInvite,
} from '../../game/multiplayer/inviteUtils';
import {
  MultiplayerJoinError,
  MultiplayerServiceUnavailableError,
  getConnectionQuality,
  type ConnectionQuality,
  type IMultiplayerService,
  type MultiplayerConnectionState,
  type MultiplayerFriend,
  type MultiplayerGameStartInfo,
  type MultiplayerInvite,
  type MultiplayerPlayer,
  type MultiplayerRoomState,
  type MultiplayerRoomSummary,
  type RoomPrivacy,
} from '../../game/multiplayer/multiplayerTypes';
import { ProfileManager } from '../../game/profile/ProfileManager';
import type { PlayerSearchSummary } from '../../../shared/profileTypes';
import type { WorldType } from '../../game/save/saveTypes';
import { useMenuNavigation } from '../../hooks/useMenuNavigation';
import { PlayerInteractionModal } from '../multiplayer/PlayerInteractionModal';
import { RoomChatPanel } from '../multiplayer/RoomChatPanel';
import { ConnectionStatusBanner } from '../multiplayer/ConnectionStatusBanner';
import { AvatarBadge } from '../profile/AvatarBadge';
import { PlayerProfileModal } from '../profile/PlayerProfileModal';
import { ProfileSetupModal } from '../profile/ProfileSetupModal';
import { MainMenuButton } from './MainMenuButton';

export type MultiplayerSubView =
  | 'hub'
  | 'createRoom'
  | 'joinRoom'
  | 'friends'
  | 'invites'
  | 'inviteFriends'
  | 'lobby';

interface MultiplayerScreenProps {
  lang: Language;
  service?: IMultiplayerService;
  initialJoinCode?: string | null;
  onConsumeInitialJoinCode?: () => void;
  onStartMultiplayerWorld?: (info: MultiplayerGameStartInfo) => void;
  onBack: () => void;
}

export const MultiplayerScreen: React.FC<MultiplayerScreenProps> = ({
  lang,
  service: injectedService,
  initialJoinCode,
  onConsumeInitialJoinCode,
  onStartMultiplayerWorld,
  onBack,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';
  const service = useMemo(
    () => injectedService ?? createMultiplayerService(),
    [injectedService],
  );

  const initialRoom = service.getRoomState();
  const [subView, setSubView] = useState<MultiplayerSubView>(() =>
    initialRoom ? 'lobby' : initialJoinCode ? 'joinRoom' : 'hub',
  );
  const [returnToLobbyAfterFriends, setReturnToLobbyAfterFriends] =
    useState(false);

  // Profile & Friends Search state
  const [profileSnap, setProfileSnap] = useState(() =>
    ProfileManager.getSnapshot(),
  );
  const [needsProfileSetup, setNeedsProfileSetup] = useState(
    () => !ProfileManager.hasProfile(),
  );
  const [profileModalTargetId, setProfileModalTargetId] = useState<
    string | null | undefined
  >(undefined);
  const [searchResults, setSearchResults] = useState<PlayerSearchSummary[] | null>(
    null,
  );
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [friendsPage, setFriendsPage] = useState(0);

  // Player & status notices
  const [playerName, setPlayerName] = useState<string>(() => {
    const p = ProfileManager.getProfile();
    return (
      p?.displayName ||
      loadSavedMultiplayerName(lang === 'ar' ? 'مغامر' : 'Adventurer')
    );
  });
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Create Room state
  const [roomName, setRoomName] = useState<string>(() =>
    lang === 'ar' ? 'عالم المغامرة' : 'WORLD OF ADVENTURE',
  );
  const [worldType, setWorldType] = useState<WorldType>('normal');
  const [maxPlayers, setMaxPlayers] = useState<number>(8);
  const [isPrivateRoom, setIsPrivateRoom] = useState<boolean>(false);
  const [allowFriends, setAllowFriends] = useState<boolean>(true);
  const [requireAllReady, setRequireAllReady] = useState<boolean>(true);
  const [roomPassword, setRoomPassword] = useState<string>('');
  const [roomNameError, setRoomNameError] = useState<string | null>(null);
  const [creatingRoom, setCreatingRoom] = useState<boolean>(false);
  const [startingGame, setStartingGame] = useState<boolean>(false);

  // Join Room & Browser state
  const [joinCode, setJoinCode] = useState<string>(() => initialJoinCode ?? '');
  const [joinPassword, setJoinPassword] = useState<string>('');
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);
  const [joiningRoom, setJoiningRoom] = useState<boolean>(false);
  const [roomSearch, setRoomSearch] = useState<string>('');
  const [rooms, setRooms] = useState<MultiplayerRoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState<boolean>(false);

  // Friends, Invites & Share state
  const [friends, setFriends] = useState<MultiplayerFriend[]>([]);
  const [friendSearchInput, setFriendSearchInput] = useState<string>('');
  const [directInviteName, setDirectInviteName] = useState<string>('');
  const [sendingInvite, setSendingInvite] = useState<boolean>(false);
  const [invites, setInvites] = useState<MultiplayerInvite[]>([]);
  const [loadingSocial, setLoadingSocial] = useState<boolean>(false);

  // Active Room Lobby state
  const [activeRoom, setActiveRoom] = useState<MultiplayerRoomState | null>(
    () => initialRoom,
  );
  const [connectionState, setConnectionState] =
    useState<MultiplayerConnectionState>(() => service.getConnectionState());
  const [serverHealthStatus, setServerHealthStatus] = useState<
    'connecting' | 'connected' | 'unavailable' | 'unconfigured'
  >(() => (service.isConfigured() ? 'connecting' : 'unconfigured'));
  const [reconnectAttempt, setReconnectAttempt] = useState<number>(() =>
    service.getReconnectAttempt(),
  );
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [inspectedPlayer, setInspectedPlayer] =
    useState<MultiplayerPlayer | null>(null);
  const [, setSocialRevision] = useState(0);

  const mpConfig = useMemo(() => getMultiplayerConfig(), []);
  const isBackendConfigured = service.isConfigured();

  const refreshServerHealth = useCallback(async () => {
    const effectiveUrl = service.getConfig().workerBaseUrl ?? mpConfig.baseUrl;
    if (!service.isConfigured() || !effectiveUrl) {
      setServerHealthStatus('unconfigured');
      return;
    }
    setServerHealthStatus('connecting');
    const res = await checkMultiplayerServerHealth(effectiveUrl, 5000);
    setServerHealthStatus(res.ok ? 'connected' : 'unavailable');
  }, [mpConfig.baseUrl, service]);

  useEffect(() => {
    void ProfileManager.ensureServerSyncedProfile();
    return ProfileManager.subscribe((next) => {
      setProfileSnap(next);
      if (next.profile?.displayName) {
        setPlayerName(next.profile.displayName);
      }
      setNeedsProfileSetup(!ProfileManager.hasProfile());
    });
  }, []);

  useEffect(() => {
    if (!activeRoom && (subView === 'hub' || subView === 'createRoom' || subView === 'joinRoom')) {
      void refreshServerHealth();
    }
  }, [activeRoom, refreshServerHealth, subView]);

  const clearNotices = useCallback(() => {
    setStatusNotice(null);
    setErrorNotice(null);
  }, []);

  const formatServiceError = useCallback(
    (err: unknown, fallbackMessage: string): string => {
      console.error('[Multiplayer]', err);
      if (!service.isConfigured()) {
        return `${t.mpNotConfiguredTitle} ${t.mpNotConfiguredHint}`;
      }
      if (err instanceof MultiplayerServiceUnavailableError) {
        return t.mpErrorUnableToConnect;
      }
      if (err instanceof Error) {
        const lower = err.message.toLowerCase();
        if (
          err.name === 'TypeError' ||
          lower.includes('failed to fetch') ||
          lower.includes('networkerror') ||
          lower.includes('network request failed') ||
          lower.includes('load failed') ||
          lower.includes('unable to connect')
        ) {
          return t.mpErrorUnableToConnect;
        }
        return err.message || fallbackMessage;
      }
      return fallbackMessage;
    },
    [
      service,
      t.mpErrorUnableToConnect,
      t.mpNotConfiguredHint,
      t.mpNotConfiguredTitle,
    ],
  );

  const formatJoinError = useCallback(
    (err: unknown): string => {
      if (err instanceof MultiplayerJoinError) {
        console.error('[Multiplayer] Join failed:', err.code, err.message);
        switch (err.code) {
          case 'ROOM_NOT_FOUND':
            return t.mpErrorRoomNotFound;
          case 'ROOM_FULL':
            return t.mpErrorRoomFull;
          case 'GAME_ALREADY_STARTED':
            return t.mpErrorGameAlreadyStarted;
          default:
            return err.message || t.mpErrorUnableToConnect;
        }
      }
      return formatServiceError(err, t.mpErrorUnableToConnect);
    },
    [formatServiceError, t],
  );

  const handlePlayerNameChange = (val: string) => {
    setPlayerName(val);
    saveMultiplayerName(val);
  };

  const refreshRoomBrowser = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const list = await service.listPublicRooms();
      setRooms(list);
    } catch {
      setRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  }, [service]);

  const refreshFriends = useCallback(async () => {
    setLoadingSocial(true);
    try {
      await ProfileManager.refreshFriends();
      const list = await service.getFriends();
      setFriends(list);
    } catch {
      setFriends([]);
    } finally {
      setLoadingSocial(false);
    }
  }, [service]);

  const refreshInvites = useCallback(async () => {
    setLoadingSocial(true);
    try {
      const cleanedName = playerName.trim() || t.mpPlayerNamePlaceholder;
      const list = await service.getInvites(cleanedName);
      setInvites(list);
    } catch {
      setInvites([]);
    } finally {
      setLoadingSocial(false);
    }
  }, [playerName, service, t.mpPlayerNamePlaceholder]);

  useEffect(() => {
    const unsubscribe = service.subscribe((ev) => {
      if (ev.type === 'connection-changed') {
        setConnectionState(ev.state);
        setReconnectAttempt(ev.attempt ?? service.getReconnectAttempt());
        if (ev.state === 'reconnecting' || ev.state === 'error') {
          setStartingGame(false);
        }
      } else if (ev.type === 'room-updated') {
        setActiveRoom(ev.room);
        setConnectionState(service.getConnectionState());
      } else if (ev.type === 'host-transferred') {
        setStatusNotice(t.mpHostTransferredNotice(ev.newHostName));
      } else if (ev.type === 'player-kicked') {
        if (ev.isLocalTarget) {
          setActiveRoom(null);
          setReturnToLobbyAfterFriends(false);
          setSubView('hub');
          setErrorNotice(t.mpKickedNotice);
        } else {
          setStatusNotice(t.mpPlayerKickedNotice(ev.targetDisplayName));
        }
      } else if (ev.type === 'room-closed') {
        setActiveRoom(null);
        setReturnToLobbyAfterFriends(false);
        setSubView('hub');
        setStatusNotice(t.mpRoomClosedNotice);
      } else if (ev.type === 'game-started') {
        setStartingGame(false);
        onStartMultiplayerWorld?.(ev.info);
      } else if (ev.type === 'invites-updated') {
        setInvites(ev.invites);
      } else if (ev.type === 'social-updated') {
        setSocialRevision((r) => r + 1);
      } else if (ev.type === 'report-submitted') {
        const target = activeRoom?.players.find(
          (p) => p.id === ev.ack.targetPlayerId,
        );
        setStatusNotice(
          t.mpReportSubmittedNotice(target?.displayName ?? ev.ack.targetPlayerId),
        );
      } else if (ev.type === 'error') {
        setStartingGame(false);
        setErrorNotice(ev.message);
      }
    });
    return unsubscribe;
  }, [activeRoom?.players, onStartMultiplayerWorld, service, t]);

  useEffect(() => {
    if (subView === 'joinRoom') {
      void refreshRoomBrowser();
    } else if (subView === 'friends' || subView === 'inviteFriends') {
      void refreshFriends();
    } else if (subView === 'invites') {
      void refreshInvites();
    }
  }, [subView, refreshRoomBrowser, refreshFriends, refreshInvites]);

  const performJoinWithTarget = useCallback(
    async (rawTarget: string, password?: string) => {
      clearNotices();
      const extracted = extractJoinTargetFromUrl(rawTarget) ?? rawTarget.trim();
      if (!extracted) {
        setJoinCodeError(t.mpRoomCodeRequired);
        return;
      }
      setJoinCodeError(null);
      const cleanedPlayer = playerName.trim() || t.mpPlayerNamePlaceholder;
      saveMultiplayerName(cleanedPlayer);
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setErrorNotice(t.mpOfflineCannotConnectNotice);
        return;
      }
      setJoiningRoom(true);
      try {
        const joined = await service.joinRoom({
          roomCodeOrId: extracted,
          playerName: cleanedPlayer,
          password: password?.trim() || undefined,
        });
        setActiveRoom(joined);
        setSubView('lobby');
      } catch (err) {
        setErrorNotice(formatJoinError(err));
      } finally {
        setJoiningRoom(false);
      }
    },
    [clearNotices, formatJoinError, playerName, service, t.mpOfflineCannotConnectNotice, t.mpPlayerNamePlaceholder, t.mpRoomCodeRequired],
  );

  // Consume deep-linked `/join/ROOM_ID` or `worldofadventure://join/ROOM_ID` target
  useEffect(() => {
    if (!initialJoinCode) return;
    setJoinCode(initialJoinCode);
    setSubView('joinRoom');
    onConsumeInitialJoinCode?.();
    if (service.isConfigured() && !activeRoom) {
      void performJoinWithTarget(initialJoinCode);
    }
  }, [activeRoom, initialJoinCode, onConsumeInitialJoinCode, performJoinWithTarget, service]);

  const handleNavigateBack = useCallback(() => {
    clearNotices();
    if (subView === 'hub') {
      onBack();
      return;
    }
    if (subView === 'inviteFriends') {
      if (activeRoom) {
        setSubView('lobby');
      } else {
        setSubView('hub');
      }
      return;
    }
    if (subView === 'friends' && returnToLobbyAfterFriends && activeRoom) {
      setReturnToLobbyAfterFriends(false);
      setSubView('lobby');
      return;
    }
    if (subView === 'lobby') {
      void service.leaveRoom();
      setActiveRoom(null);
      setSubView('hub');
      return;
    }
    setReturnToLobbyAfterFriends(false);
    setSubView('hub');
  }, [activeRoom, clearNotices, onBack, returnToLobbyAfterFriends, service, subView]);

  // Escape back handling for non-hub subviews (hub Escape is handled by useMenuNavigation)
  useEffect(() => {
    if (subView === 'hub') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (inspectedPlayer) {
          setInspectedPlayer(null);
          return;
        }
        handleNavigateBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [subView, inspectedPlayer, handleNavigateBack]);

  const openCreateRoom = useCallback(() => {
    clearNotices();
    setRoomNameError(null);
    setSubView('createRoom');
  }, [clearNotices]);

  const openJoinRoom = useCallback(() => {
    clearNotices();
    setJoinCodeError(null);
    setSubView('joinRoom');
  }, [clearNotices]);

  const handleQuickJoin = useCallback(async () => {
    clearNotices();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setErrorNotice(t.mpOfflineCannotConnectNotice);
      return;
    }
    const cleanedName = playerName.trim() || t.mpPlayerNamePlaceholder;
    try {
      const joined = await service.quickJoin(cleanedName);
      setActiveRoom(joined);
      setSubView('lobby');
    } catch (err) {
      setErrorNotice(formatServiceError(err, t.mpErrorUnableToConnect));
    }
  }, [clearNotices, formatServiceError, playerName, service, t]);

  const openFriends = useCallback(
    (fromLobby = false) => {
      clearNotices();
      setReturnToLobbyAfterFriends(fromLobby);
      setSubView('friends');
    },
    [clearNotices],
  );

  const openInvites = useCallback(() => {
    clearNotices();
    setReturnToLobbyAfterFriends(false);
    setSubView('invites');
  }, [clearNotices]);

  const openInviteFriends = useCallback(() => {
    clearNotices();
    setCopiedCode(false);
    setCopiedLink(false);
    setSubView('inviteFriends');
  }, [clearNotices]);

  const hubActions = useMemo(
    () => [
      openCreateRoom,
      openJoinRoom,
      () => void handleQuickJoin(),
      () => openFriends(false),
      openInvites,
      handleNavigateBack,
    ],
    [
      openCreateRoom,
      openJoinRoom,
      handleQuickJoin,
      openFriends,
      openInvites,
      handleNavigateBack,
    ],
  );

  const { focusedIndex, setFocusedIndex, registerItem } = useMenuNavigation({
    enabled: subView === 'hub',
    itemCount: hubActions.length,
    orientation: 'vertical',
    onActivate: (idx) => {
      hubActions[idx]?.();
    },
    onBack: handleNavigateBack,
  });

  const handleCreateRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingRoom) return;
    clearNotices();
    const cleanedRoom = roomName.trim();
    const cleanedPlayer = playerName.trim() || t.mpPlayerNamePlaceholder;
    if (!cleanedRoom) {
      setRoomNameError(t.mpRoomNameRequired);
      return;
    }
    setRoomNameError(null);
    saveMultiplayerName(cleanedPlayer);

    const derivedPrivacy: RoomPrivacy = !isPrivateRoom
      ? 'public'
      : allowFriends
        ? 'friends'
        : 'private';

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setErrorNotice(t.mpOfflineCannotConnectNotice);
      return;
    }
    setCreatingRoom(true);
    try {
      const created = await service.createRoom({
        roomName: cleanedRoom.slice(0, 36),
        playerName: cleanedPlayer.slice(0, 24),
        worldName: cleanedRoom.slice(0, 36),
        worldType,
        difficulty: 'normal',
        maxPlayers,
        privacy: derivedPrivacy,
        isPrivate: isPrivateRoom,
        allowFriends,
        requireAllReady,
        password: roomPassword.trim() || undefined,
      });
      setActiveRoom(created);
      setSubView('lobby');
    } catch (err) {
      setErrorNotice(formatServiceError(err, t.mpErrorRoomCreationFailed));
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joiningRoom) return;
    await performJoinWithTarget(joinCode, joinPassword);
  };

  const handleJoinBrowserRoom = async (room: MultiplayerRoomSummary) => {
    if (joiningRoom) return;
    await performJoinWithTarget(room.roomCode || room.roomId);
  };

  const handleToggleReady = async () => {
    if (!activeRoom) return;
    clearNotices();
    const localPlayer = activeRoom.players.find((p) => p.isLocal);
    const nextReady = !(localPlayer?.isReady ?? false);

    try {
      const updated = await service.setReady(nextReady);
      if (updated) {
        setActiveRoom(updated);
      }
    } catch (err) {
      setErrorNotice(
        err instanceof Error ? err.message : t.mpServerNoticeBanner,
      );
    }
  };

  const handleStartGame = async () => {
    if (startingGame) return;
    clearNotices();
    setStartingGame(true);
    try {
      await service.startGame();
    } catch (err) {
      setStartingGame(false);
      setErrorNotice(formatServiceError(err, t.mpErrorUnableToConnect));
    }
  };

  const handleKickPlayer = async (targetPlayerId: string) => {
    clearNotices();
    try {
      await service.kickPlayer(targetPlayerId);
    } catch (err) {
      setErrorNotice(
        err instanceof Error ? err.message : t.mpServerNoticeBanner,
      );
    }
  };

  const handleTransferHost = async (targetPlayerId: string) => {
    clearNotices();
    try {
      await service.transferHost(targetPlayerId);
    } catch (err) {
      setErrorNotice(
        err instanceof Error ? err.message : t.mpServerNoticeBanner,
      );
    }
  };

  const handleUpdateRequireAllReady = async (nextRequired: boolean) => {
    clearNotices();
    try {
      await service.updateRoomSettings({ requireAllReady: nextRequired });
    } catch (err) {
      setErrorNotice(
        err instanceof Error ? err.message : t.mpServerNoticeBanner,
      );
    }
  };

  const handleCloseRoom = async () => {
    clearNotices();
    try {
      await service.closeRoom();
      setActiveRoom(null);
      setReturnToLobbyAfterFriends(false);
      setSubView('hub');
    } catch (err) {
      setErrorNotice(
        err instanceof Error ? err.message : t.mpServerNoticeBanner,
      );
    }
  };

  const handleLeaveRoom = async () => {
    clearNotices();
    try {
      await service.leaveRoom();
    } catch {
      // Ignore network errors while leaving room cleanly
    } finally {
      setActiveRoom(null);
      setReturnToLobbyAfterFriends(false);
      setSubView('hub');
    }
  };

  const roomShareLink = useMemo(
    () => (activeRoom ? buildRoomShareLink(activeRoom.roomId) : ''),
    [activeRoom],
  );

  const handleCopyRoomCode = async () => {
    if (!activeRoom) return;
    const ok = await copyTextToClipboard(activeRoom.roomCode);
    if (ok) {
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1800);
    }
  };

  const handleCopyRoomLink = async () => {
    if (!roomShareLink) return;
    const ok = await copyTextToClipboard(roomShareLink);
    if (ok) {
      setCopiedLink(true);
      setStatusNotice(t.mpLinkCopiedNotice);
      window.setTimeout(() => setCopiedLink(false), 1800);
    }
  };

  const handleShareRoomLink = async () => {
    if (!activeRoom || !roomShareLink) return;
    clearNotices();
    const res = await shareRoomInvite({
      title: `${t.gameTitle} · ${activeRoom.roomName}`,
      text: `${t.mpRoomCodeLabel}: ${activeRoom.roomCode}`,
      url: roomShareLink,
    });
    if (res.status === 'copied-fallback' && res.copied) {
      setCopiedLink(true);
      setStatusNotice(t.mpLinkCopiedNotice);
      window.setTimeout(() => setCopiedLink(false), 1800);
    }
  };

  const handleAddFriendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearNotices();
    const cleaned = friendSearchInput.trim();
    if (!cleaned) {
      setSearchResults(null);
      return;
    }
    if (service.isConfigured() && cleaned.length >= 2) {
      setSearchingPlayers(true);
      try {
        const results = await ProfileManager.searchPlayers(cleaned);
        setSearchResults(results);
        if (results.length > 0) {
          setSearchingPlayers(false);
          return;
        }
      } catch {
        // Fallback below if offline
      } finally {
        setSearchingPlayers(false);
      }
    }
    const next = await service.addFriend(cleaned);
    setFriends(next);
    setFriendSearchInput('');
  };

  const handleRemoveFriend = async (friendId: string) => {
    clearNotices();
    if (friendId.startsWith('WA-')) {
      await ProfileManager.removeFriend(friendId);
      return;
    }
    const next = await service.removeFriend(friendId);
    setFriends(next);
  };

  const handleInviteFriend = async (
    targetPlayerName: string,
    targetPublicProfileId?: string,
  ) => {
    if (sendingInvite) return;
    clearNotices();
    const cleanedTarget = targetPlayerName.trim();
    if (!cleanedTarget) return;
    setSendingInvite(true);
    try {
      await service.sendInvite(cleanedTarget, targetPublicProfileId);
      setStatusNotice(t.mpInviteSentNotice(cleanedTarget));
      setDirectInviteName('');
    } catch (err) {
      setErrorNotice(formatJoinError(err));
    } finally {
      setSendingInvite(false);
    }
  };

  const handleSendDirectInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleInviteFriend(directInviteName);
  };

  const handleAcceptInvite = async (inviteId: string) => {
    clearNotices();
    const cleanedPlayer = playerName.trim() || t.mpPlayerNamePlaceholder;
    saveMultiplayerName(cleanedPlayer);
    try {
      const joined = await service.acceptInvite(inviteId, cleanedPlayer);
      setActiveRoom(joined);
      setSubView('lobby');
    } catch (err) {
      setErrorNotice(formatJoinError(err));
    }
  };

  const handleDeclineInvite = async (inviteId: string) => {
    clearNotices();
    await service.declineInvite(inviteId);
    setInvites((prev) => prev.filter((inv) => inv.inviteId !== inviteId));
  };

  const filteredRooms = useMemo(() => {
    const q = roomSearch.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(
      (r) =>
        r.roomName.toLowerCase().includes(q) ||
        r.hostName.toLowerCase().includes(q) ||
        r.roomCode.toLowerCase().includes(q),
    );
  }, [roomSearch, rooms]);

  const worldTypes: Array<{
    id: WorldType;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'normal', label: t.worldTypeNormal, icon: <Compass className="w-4 h-4" /> },
    { id: 'survival', label: t.worldTypeSurvival, icon: <Flame className="w-4 h-4" /> },
    { id: 'adventure', label: t.worldTypeAdventure, icon: <Sparkles className="w-4 h-4" /> },
    { id: 'creative', label: t.worldTypeCreative, icon: <Hammer className="w-4 h-4" /> },
  ];

  const headerTitle =
    subView === 'createRoom'
      ? t.mpCreateRoom
      : subView === 'joinRoom'
        ? t.mpJoinRoom
        : subView === 'friends'
          ? t.mpFriends
          : subView === 'invites'
            ? t.mpInvites
            : subView === 'inviteFriends'
              ? t.mpInviteFriends
              : subView === 'lobby'
                ? activeRoom?.roomName || t.mpLobbyTitle
                : t.menuMultiplayer;

  const headerSubtitle =
    subView === 'friends'
      ? t.mpFriendsSubtitle
      : subView === 'invites'
        ? t.mpInvitesSubtitle
        : subView === 'inviteFriends'
          ? t.mpInviteFriendsSubtitle
          : subView === 'lobby' && activeRoom
            ? `${t.mpRoomLabel}: ${activeRoom.roomCode} · ${t.mpPlayersShort(
                activeRoom.players.length,
                activeRoom.maxPlayers,
              )}`
            : t.mpSubtitle;

  const localPlayer = activeRoom?.players.find((p) => p.isLocal) ?? null;
  const isLocalHost = Boolean(
    activeRoom &&
      (localPlayer?.isHost ||
        (service.getLocalPlayerId() && activeRoom.hostId === service.getLocalPlayerId())),
  );
  const isLocalReady = Boolean(localPlayer?.isReady);
  const nonHostPlayers = activeRoom
    ? activeRoom.players.filter((p) => !p.isHost && p.id !== activeRoom.hostId)
    : [];
  const readyNonHostCount = nonHostPlayers.filter((p) => p.isReady).length;
  const allRequiredPlayersReady = nonHostPlayers.every((p) => p.isReady);
  const requireAllReadyActive = activeRoom?.requireAllReady ?? true;
  const canHostStartGame =
    !startingGame &&
    !activeRoom?.locked &&
    (!requireAllReadyActive || allRequiredPlayersReady);

  const localLatencyMs = service.getLatencyMs() ?? localPlayer?.pingMs ?? null;
  const localQuality: ConnectionQuality = getConnectionQuality(
    localLatencyMs,
    connectionState === 'connected',
  );

  const getQualityMeta = (quality: ConnectionQuality) => {
    switch (quality) {
      case 'excellent':
        return {
          label: t.mpQualityExcellent,
          textClass: 'text-[#7fe094]',
          badgeClass: 'bg-[#173222] border-[#7fe094]/45 text-[#9ef0b0]',
          dotClass: 'bg-[#7fe094]',
        };
      case 'good':
        return {
          label: t.mpQualityGood,
          textClass: 'text-[#f3c66c]',
          badgeClass: 'bg-[#2b2514] border-[#e5a93c]/45 text-[#f7d488]',
          dotClass: 'bg-[#e5a93c]',
        };
      case 'poor':
        return {
          label: t.mpQualityPoor,
          textClass: 'text-[#f4976c]',
          badgeClass: 'bg-[#2f1c15] border-[#e87a4a]/45 text-[#f7b194]',
          dotClass: 'bg-[#e87a4a]',
        };
      case 'disconnected':
      default:
        return {
          label: t.mpQualityDisconnected,
          textClass: 'text-[#f28b7d]',
          badgeClass: 'bg-[#2a1618] border-[#e05a47]/45 text-[#f4b1a7]',
          dotClass: 'bg-[#e05a47]',
        };
    }
  };
  const localQualityMeta = getQualityMeta(localQuality);

  const serverStatusUi = useMemo(() => {
    if (!isBackendConfigured) {
      return {
        label: t.mpStatusDisconnected,
        detail: `${t.mpNotConfiguredTitle} ${t.mpNotConfiguredHint}`,
        badgeClass: 'bg-[#2a1618] border-[#e05a47]/45 text-[#f4b1a7]',
        dotClass: 'bg-[#e05a47]',
      };
    }
    if (connectionState === 'reconnecting') {
      return {
        label: t.mpStatusReconnecting,
        detail: null,
        badgeClass: 'bg-[#2b2514] border-[#e5a93c]/45 text-[#f7d488]',
        dotClass: 'bg-[#e5a93c] animate-pulse',
      };
    }
    if (
      connectionState === 'connecting' ||
      (!activeRoom && serverHealthStatus === 'connecting')
    ) {
      return {
        label: t.mpStatusConnecting,
        detail: null,
        badgeClass: 'bg-[#2b2514] border-[#e5a93c]/45 text-[#f7d488]',
        dotClass: 'bg-[#e5a93c] animate-pulse',
      };
    }
    if (
      connectionState === 'connected' ||
      (!activeRoom && serverHealthStatus === 'connected')
    ) {
      return {
        label: t.mpStatusConnected,
        detail: null,
        badgeClass: 'bg-[#173222] border-[#7fe094]/45 text-[#9ef0b0]',
        dotClass: 'bg-[#7fe094]',
      };
    }
    if (
      connectionState === 'error' ||
      (!activeRoom && serverHealthStatus === 'unavailable')
    ) {
      return {
        label: t.mpStatusServerUnavailable,
        detail: null,
        badgeClass: 'bg-[#2a1618] border-[#e05a47]/45 text-[#f4b1a7]',
        dotClass: 'bg-[#e05a47]',
      };
    }
    return {
      label: t.mpStatusDisconnected,
      detail: null,
      badgeClass: 'bg-[#151e19] border-white/15 text-[#9db1a1]',
      dotClass: 'bg-[#9db1a1]',
    };
  }, [
    activeRoom,
    connectionState,
    isBackendConfigured,
    serverHealthStatus,
    t.mpNotConfiguredHint,
    t.mpNotConfiguredTitle,
    t.mpStatusConnected,
    t.mpStatusConnecting,
    t.mpStatusDisconnected,
    t.mpStatusReconnecting,
    t.mpStatusServerUnavailable,
  ]);

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#08110c]/74 backdrop-blur-md p-3 sm:p-6 mobile-hud-safe pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="multiplayer-screen-title"
      data-testid="multiplayer-screen"
    >
      <div className="woa-surface w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-2xl bg-[#101c16]/94 border border-[#2b4436] text-[#f2f6ef] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2
              id="multiplayer-screen-title"
              className="font-display text-lg sm:text-2xl font-bold tracking-tight truncate"
            >
              {headerTitle}
            </h2>
            <p className="woa-muted-text text-xs sm:text-sm text-[#9db1a1] mt-0.5 truncate">
              {headerSubtitle}
            </p>
          </div>
          <button
            type="button"
            data-testid="mp-back-top"
            onClick={handleNavigateBack}
            className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-white/12 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-[#dce5d8] cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#e5a93c]"
          >
            <ArrowLeft className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
            <span className="hidden sm:inline">{t.backBtn}</span>
          </button>
        </div>

        {/* Status / Info Notice Banner */}
        {(statusNotice || errorNotice) && (
          <div
            role="status"
            data-testid="mp-status-banner"
            className={`px-4 sm:px-5 py-2.5 border-b text-xs sm:text-sm flex items-start gap-2.5 shrink-0 ${
              errorNotice
                ? 'bg-[#2a1618]/90 border-[#e05a47]/35 text-[#f6d5d0]'
                : 'bg-[#13241c]/90 border-[#e5a93c]/30 text-[#e8efe5]'
            }`}
          >
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-[#e5a93c]" />
            <span className="leading-snug">{errorNotice ?? statusNotice}</span>
          </div>
        )}

        {/* Main Scrollable Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* 1. MULTIPLAYER HUB */}
          {subView === 'hub' && (
            <div className="space-y-4" data-testid="mp-hub-view">
              {/* Explorer Identity Card */}
              {profileSnap.profile ? (
                <div className="p-3 rounded-xl bg-[#0c1611] border border-[#2b4436] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <AvatarBadge
                      avatar={profileSnap.profile.avatar}
                      seed={profileSnap.profile.publicProfileId}
                      displayName={profileSnap.profile.displayName}
                      size="md"
                      status={profileSnap.profile.presenceStatus}
                    />
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span
                          dir="auto"
                          className="font-display font-bold text-sm sm:text-base text-white truncate"
                        >
                          {profileSnap.profile.displayName}
                        </span>
                        <span
                          dir="ltr"
                          className="font-mono-num text-xs text-[#9db1a1]"
                        >
                          #{profileSnap.profile.playerTag}
                        </span>
                      </div>
                      <div
                        dir="ltr"
                        className="text-[11px] font-mono-num text-[#e5a93c] flex items-center gap-1.5"
                      >
                        <span>{profileSnap.profile.publicProfileId}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#9db1a1]">
                          {t.levelShort} {profileSnap.profile.stats.level}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="mp-hub-open-profile-btn"
                    onClick={() => setProfileModalTargetId(null)}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#345443] text-xs font-display font-bold text-[#f2f6ef] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {t.profileOpenBtn}
                  </button>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="mp-player-name-input"
                    className="block text-xs sm:text-sm font-semibold text-[#e6eee4] mb-1.5"
                  >
                    {t.mpPlayerNameLabel}
                  </label>
                  <input
                    id="mp-player-name-input"
                    type="text"
                    data-testid="mp-player-name-input"
                    maxLength={24}
                    value={playerName}
                    onChange={(e) => handlePlayerNameChange(e.target.value)}
                    placeholder={t.mpPlayerNamePlaceholder}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-sm text-[#f7faf5] placeholder-[#687e6d]"
                  />
                </div>
              )}

              {/* Dedicated 6-Button Multiplayer Menu */}
              <nav
                aria-label={t.menuMultiplayer}
                className="flex flex-col gap-2.5"
                data-testid="mp-menu-buttons"
              >
                <MainMenuButton
                  testId="mp-btn-create-room"
                  label={t.mpCreateRoom}
                  icon={<PlusCircle className="w-5 h-5" />}
                  variant="primary"
                  isRtl={isRtl}
                  focused={focusedIndex === 0}
                  buttonRef={registerItem(0)}
                  onClick={() => {
                    setFocusedIndex(0);
                    openCreateRoom();
                  }}
                />

                <MainMenuButton
                  testId="mp-btn-join-room"
                  label={t.mpJoinRoom}
                  icon={<DoorOpen className="w-5 h-5" />}
                  isRtl={isRtl}
                  focused={focusedIndex === 1}
                  buttonRef={registerItem(1)}
                  onClick={() => {
                    setFocusedIndex(1);
                    openJoinRoom();
                  }}
                />

                <MainMenuButton
                  testId="mp-btn-quick-join"
                  label={t.mpQuickJoin}
                  icon={<Zap className="w-5 h-5" />}
                  isRtl={isRtl}
                  focused={focusedIndex === 2}
                  buttonRef={registerItem(2)}
                  onClick={() => {
                    setFocusedIndex(2);
                    void handleQuickJoin();
                  }}
                />

                <MainMenuButton
                  testId="mp-btn-friends"
                  label={t.mpFriends}
                  icon={<Users className="w-5 h-5" />}
                  isRtl={isRtl}
                  focused={focusedIndex === 3}
                  buttonRef={registerItem(3)}
                  onClick={() => {
                    setFocusedIndex(3);
                    openFriends(false);
                  }}
                />

                <MainMenuButton
                  testId="mp-btn-invites"
                  label={t.mpInvites}
                  icon={<Mail className="w-5 h-5" />}
                  isRtl={isRtl}
                  focused={focusedIndex === 4}
                  buttonRef={registerItem(4)}
                  onClick={() => {
                    setFocusedIndex(4);
                    openInvites();
                  }}
                />

                <MainMenuButton
                  testId="mp-btn-back"
                  label={t.backBtn}
                  icon={
                    <ArrowLeft className={`w-5 h-5 ${isRtl ? 'rotate-180' : ''}`} />
                  }
                  isRtl={isRtl}
                  focused={focusedIndex === 5}
                  buttonRef={registerItem(5)}
                  onClick={() => {
                    setFocusedIndex(5);
                    handleNavigateBack();
                  }}
                />
              </nav>

              <div
                data-testid="mp-server-status"
                className="pt-2.5 border-t border-white/10 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-semibold ${serverStatusUi.badgeClass}`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${serverStatusUi.dotClass}`} />
                    <span>{serverStatusUi.label}</span>
                  </span>
                  {isBackendConfigured && serverHealthStatus === 'unavailable' && (
                    <button
                      type="button"
                      data-testid="mp-retry-health-btn"
                      onClick={() => void refreshServerHealth()}
                      className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#182920] hover:bg-[#22392d] border border-[#2f493b] text-[11px] font-semibold text-[#e4ece1] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3 text-[#e5a93c]" />
                      <span>{t.mpRetryConnectionBtn}</span>
                    </button>
                  )}
                </div>
                {!isBackendConfigured && (
                  <p
                    data-testid="mp-not-configured-warning"
                    className="text-xs text-[#f6d5d0] bg-[#2a1618]/75 border border-[#e05a47]/35 rounded-xl px-3 py-2 leading-relaxed"
                  >
                    {t.mpNotConfiguredTitle}
                    <br />
                    {t.mpNotConfiguredHint}
                  </p>
                )}
                {import.meta.env.DEV && (
                  <pre
                    dir="ltr"
                    data-testid="mp-dev-diagnostic"
                    className="text-[11px] font-mono-num text-[#9db1a1] bg-[#0a140f] border border-white/10 rounded-xl px-3 py-2 whitespace-pre-wrap break-all"
                  >
                    {formatMultiplayerDiagnosticReport(mpConfig)}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* 2. CREATE ROOM */}
          {subView === 'createRoom' && (
            <form
              id="mp-create-room-form"
              onSubmit={handleCreateRoomSubmit}
              className="space-y-4"
              data-testid="mp-create-room-view"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label
                    htmlFor="mp-create-player-name"
                    className="block text-xs sm:text-sm font-semibold text-[#e6eee4] mb-1.5"
                  >
                    {t.mpPlayerNameLabel}
                  </label>
                  <input
                    id="mp-create-player-name"
                    type="text"
                    data-testid="mp-create-player-name-input"
                    maxLength={24}
                    value={playerName}
                    onChange={(e) => handlePlayerNameChange(e.target.value)}
                    placeholder={t.mpPlayerNamePlaceholder}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-sm text-[#f7faf5] placeholder-[#687e6d]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="mp-room-name-input"
                    className="block text-xs sm:text-sm font-semibold text-[#e6eee4] mb-1.5"
                  >
                    {t.mpRoomNameLabel}
                  </label>
                  <input
                    id="mp-room-name-input"
                    type="text"
                    data-testid="mp-room-name-input"
                    maxLength={36}
                    value={roomName}
                    onChange={(e) => {
                      setRoomName(e.target.value);
                      if (roomNameError && e.target.value.trim()) {
                        setRoomNameError(null);
                      }
                    }}
                    placeholder={t.mpRoomNamePlaceholder}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-sm text-[#f7faf5] placeholder-[#687e6d]"
                  />
                  {roomNameError && (
                    <p
                      data-testid="mp-room-name-error"
                      className="mt-1 text-xs font-medium text-[#f28b7d]"
                    >
                      {roomNameError}
                    </p>
                  )}
                </div>
              </div>

              {/* Game Mode */}
              <div>
                <div className="text-xs sm:text-sm font-semibold text-[#e6eee4] mb-2">
                  {t.mpGameModeLabel}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {worldTypes.map((wt) => {
                    const selected = worldType === wt.id;
                    return (
                      <button
                        key={wt.id}
                        type="button"
                        data-testid={`mp-game-mode-${wt.id}`}
                        aria-pressed={selected}
                        onClick={() => setWorldType(wt.id)}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-display font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                          selected
                            ? 'bg-[#20382b] border-[#e5a93c] text-[#ffffff]'
                            : 'bg-[#0c1712] hover:bg-[#15251d] border-[#294034] text-[#dce5d8]'
                        }`}
                      >
                        <span className="text-[#e5a93c] shrink-0">{wt.icon}</span>
                        <span className="truncate">{wt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Max Players */}
              <div>
                <div className="text-xs sm:text-sm font-semibold text-[#e6eee4] mb-2">
                  {t.mpMaxPlayersLabel}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[2, 4, 8, 16, 32].map((count) => {
                    const selected = maxPlayers === count;
                    return (
                      <button
                        key={count}
                        type="button"
                        data-testid={`mp-max-players-${count}`}
                        aria-pressed={selected}
                        onClick={() => setMaxPlayers(count)}
                        className={`min-h-[44px] px-2 rounded-xl border font-mono-num text-sm font-bold transition-colors cursor-pointer ${
                          selected
                            ? 'bg-[#20382b] border-[#e5a93c] text-[#ffffff]'
                            : 'bg-[#0c1712] hover:bg-[#15251d] border-[#294034] text-[#dce5d8]'
                        }`}
                      >
                        {count}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Private Room & Allow Friends Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-[#e6eee4] mb-2">
                    {t.mpPrivateRoomLabel}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="mp-private-room-on"
                      aria-pressed={isPrivateRoom}
                      onClick={() => setIsPrivateRoom(true)}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-display font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        isPrivateRoom
                          ? 'bg-[#20382b] border-[#e5a93c] text-[#ffffff]'
                          : 'bg-[#0c1712] hover:bg-[#15251d] border-[#294034] text-[#dce5d8]'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5 text-[#e5a93c]" />
                      <span>{t.mpToggleOn}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="mp-private-room-off"
                      aria-pressed={!isPrivateRoom}
                      onClick={() => setIsPrivateRoom(false)}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-display font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        !isPrivateRoom
                          ? 'bg-[#20382b] border-[#e5a93c] text-[#ffffff]'
                          : 'bg-[#0c1712] hover:bg-[#15251d] border-[#294034] text-[#dce5d8]'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5 text-[#e5a93c]" />
                      <span>{t.mpToggleOff}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-xs sm:text-sm font-semibold text-[#e6eee4] mb-2">
                    {t.mpAllowFriendsLabel}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="mp-allow-friends-on"
                      aria-pressed={allowFriends}
                      onClick={() => setAllowFriends(true)}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-display font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        allowFriends
                          ? 'bg-[#20382b] border-[#e5a93c] text-[#ffffff]'
                          : 'bg-[#0c1712] hover:bg-[#15251d] border-[#294034] text-[#dce5d8]'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5 text-[#e5a93c]" />
                      <span>{t.mpToggleOn}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="mp-allow-friends-off"
                      aria-pressed={!allowFriends}
                      onClick={() => setAllowFriends(false)}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-display font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        !allowFriends
                          ? 'bg-[#20382b] border-[#e5a93c] text-[#ffffff]'
                          : 'bg-[#0c1712] hover:bg-[#15251d] border-[#294034] text-[#dce5d8]'
                      }`}
                    >
                      <span>{t.mpToggleOff}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Require All Players Ready */}
              <div>
                <div className="text-xs sm:text-sm font-semibold text-[#e6eee4] mb-2">
                  {t.mpRequireAllReadyLabel}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-testid="mp-require-all-ready-on"
                    aria-pressed={requireAllReady}
                    onClick={() => setRequireAllReady(true)}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-display font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      requireAllReady
                        ? 'bg-[#20382b] border-[#e5a93c] text-[#ffffff]'
                        : 'bg-[#0c1712] hover:bg-[#15251d] border-[#294034] text-[#dce5d8]'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#e5a93c]" />
                    <span>{t.mpToggleOn}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="mp-require-all-ready-off"
                    aria-pressed={!requireAllReady}
                    onClick={() => setRequireAllReady(false)}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-display font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      !requireAllReady
                        ? 'bg-[#20382b] border-[#e5a93c] text-[#ffffff]'
                        : 'bg-[#0c1712] hover:bg-[#15251d] border-[#294034] text-[#dce5d8]'
                    }`}
                  >
                    <span>{t.mpToggleOff}</span>
                  </button>
                </div>
              </div>

              {/* Optional Password */}
              <div>
                <label
                  htmlFor="mp-room-password-input"
                  className="block text-xs sm:text-sm font-semibold text-[#e6eee4] mb-1.5"
                >
                  {t.mpPasswordLabel}
                </label>
                <input
                  id="mp-room-password-input"
                  type="password"
                  data-testid="mp-room-password-input"
                  maxLength={24}
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                  placeholder={t.mpPasswordOptionalPlaceholder}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-sm text-[#f7faf5] placeholder-[#687e6d]"
                />
              </div>
            </form>
          )}

          {/* 3. JOIN ROOM & ROOM BROWSER */}
          {subView === 'joinRoom' && (
            <div className="space-y-5" data-testid="mp-join-room-view">
              {/* Join by Room Code / Link */}
              <form onSubmit={handleJoinByCode} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="mp-join-code-input"
                      className="block text-xs sm:text-sm font-semibold text-[#e6eee4] mb-1.5"
                    >
                      {t.mpEnterRoomCodeLabel}
                    </label>
                    <input
                      id="mp-join-code-input"
                      type="text"
                      data-testid="mp-join-code-input"
                      maxLength={256}
                      dir="ltr"
                      value={joinCode}
                      onChange={(e) => {
                        setJoinCode(e.target.value);
                        if (joinCodeError && e.target.value.trim()) {
                          setJoinCodeError(null);
                        }
                      }}
                      placeholder={t.mpRoomCodePlaceholder}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-sm font-mono-num text-[#f7faf5] placeholder-[#687e6d]"
                    />
                    {joinCodeError && (
                      <p
                        data-testid="mp-join-code-error"
                        className="mt-1 text-xs font-medium text-[#f28b7d]"
                      >
                        {joinCodeError}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="mp-join-password-input"
                      className="block text-xs sm:text-sm font-semibold text-[#e6eee4] mb-1.5"
                    >
                      {t.mpPasswordLabel}
                    </label>
                    <input
                      id="mp-join-password-input"
                      type="password"
                      data-testid="mp-join-password-input"
                      maxLength={24}
                      value={joinPassword}
                      onChange={(e) => setJoinPassword(e.target.value)}
                      placeholder={t.mpPasswordOptionalPlaceholder}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-sm text-[#f7faf5] placeholder-[#687e6d]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={joiningRoom}
                  data-testid="mp-join-code-submit-btn"
                  className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] disabled:opacity-60 text-[#111914] font-display font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <DoorOpen className="w-4 h-4" />
                  <span>{joiningRoom ? t.mpVerifyingRoom : t.mpJoinRoom}</span>
                </button>
              </form>

              {/* Room Browser */}
              <div className="pt-4 border-t border-white/10 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-base sm:text-lg font-bold text-[#f7faf5]">
                    {t.mpRoomBrowserTitle}
                  </h3>
                  <button
                    type="button"
                    data-testid="mp-refresh-rooms-btn"
                    onClick={() => void refreshRoomBrowser()}
                    disabled={loadingRooms}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#2f493b] text-xs font-semibold text-[#e4ece1] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-60"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 text-[#e5a93c] ${loadingRooms ? 'animate-spin' : ''}`}
                    />
                    <span>{t.mpRefreshBtn}</span>
                  </button>
                </div>

                <div className="relative">
                  <Search
                    className={`w-4 h-4 text-[#7f9785] absolute top-1/2 -translate-y-1/2 ${
                      isRtl ? 'right-3.5' : 'left-3.5'
                    }`}
                  />
                  <input
                    type="text"
                    data-testid="mp-room-search-input"
                    value={roomSearch}
                    onChange={(e) => setRoomSearch(e.target.value)}
                    placeholder={t.mpSearchRoomsPlaceholder}
                    className={`w-full min-h-[44px] py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-sm text-[#f7faf5] placeholder-[#687e6d] ${
                      isRtl ? 'pr-10 pl-3.5' : 'pl-10 pr-3.5'
                    }`}
                  />
                </div>

                {filteredRooms.length === 0 ? (
                  <div
                    data-testid="mp-room-browser-empty"
                    className="py-8 px-4 text-center rounded-xl bg-[#0c1611] border border-dashed border-[#2b4436]"
                  >
                    <Globe className="w-7 h-7 text-[#e5a93c] mx-auto mb-2.5 opacity-90" />
                    <h4 className="font-display text-sm sm:text-base font-bold text-[#f7faf5]">
                      {t.mpNoRoomsTitle}
                    </h4>
                    <p className="woa-muted-text text-xs sm:text-sm text-[#9db1a1] mt-1 max-w-md mx-auto leading-relaxed">
                      {t.mpNoRoomsDesc}
                    </p>
                    <button
                      type="button"
                      data-testid="mp-empty-create-room-btn"
                      onClick={openCreateRoom}
                      className="mt-4 min-h-[44px] px-4 py-2 rounded-xl bg-[#182920] hover:bg-[#233a2e] border border-[#345443] text-xs sm:text-sm font-display font-bold text-[#f2f6ef] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <PlusCircle className="w-4 h-4 text-[#e5a93c]" />
                      <span>{t.mpCreateRoom}</span>
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#0c1611]">
                    {filteredRooms.map((room) => (
                      <div
                        key={room.roomId}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {room.hasPassword && (
                              <Lock className="w-3.5 h-3.5 text-[#e5a93c] shrink-0" />
                            )}
                            <span className="font-display font-bold text-sm sm:text-base text-[#f7faf5] truncate">
                              {room.roomName}
                            </span>
                          </div>
                          <div className="text-xs text-[#9db1a1] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span>{room.hostName}</span>
                            <span aria-hidden="true">·</span>
                            <span>{room.worldType}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-num">
                              {room.playerCount}/{room.maxPlayers}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleJoinBrowserRoom(room)}
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-xs sm:text-sm cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {t.mpJoinRoom}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. FRIENDS */}
          {subView === 'friends' && (
            <div className="space-y-4" data-testid="mp-friends-view">
              {/* Quick Friends / Invites switcher */}
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#0a140f] border border-[#294034]">
                <button
                  type="button"
                  data-testid="mp-tab-friends"
                  onClick={() => openFriends(returnToLobbyAfterFriends)}
                  className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg bg-[#20382b] text-white font-display font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Users className="w-4 h-4 text-[#e5a93c]" />
                  <span>{t.mpFriends}</span>
                </button>
                <button
                  type="button"
                  data-testid="mp-tab-invites"
                  onClick={openInvites}
                  className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg text-[#b7c8ba] hover:text-white font-display font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Mail className="w-4 h-4" />
                  <span>{t.mpInvites}</span>
                </button>
              </div>

              <form onSubmit={handleAddFriendSubmit} className="flex gap-2">
                <input
                  type="text"
                  data-testid="mp-add-friend-input"
                  maxLength={40}
                  value={friendSearchInput}
                  onChange={(e) => {
                    setFriendSearchInput(e.target.value);
                    if (!e.target.value.trim()) setSearchResults(null);
                  }}
                  placeholder={t.profileSearchPlayerPlaceholder}
                  className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-sm text-[#f7faf5] placeholder-[#687e6d]"
                />
                <button
                  type="submit"
                  data-testid="mp-add-friend-btn"
                  disabled={searchingPlayers}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#345443] text-xs sm:text-sm font-display font-bold text-[#f2f6ef] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Search className="w-4 h-4 text-[#e5a93c]" />
                  <span>
                    {service.isConfigured() ? t.profileSearchBtn : t.mpAddFriendBtn}
                  </span>
                </button>
              </form>

              {/* Online Player Search Results */}
              {searchResults !== null && (
                <div
                  data-testid="mp-player-search-results"
                  className="p-3 rounded-xl bg-[#0c1611] border border-[#2b4436] space-y-2.5"
                >
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#e5a93c]">
                    <span>{t.profileSearchPlayerTitle}</span>
                    <button
                      type="button"
                      onClick={() => setSearchResults(null)}
                      className="text-[#9db1a1] hover:text-white cursor-pointer"
                    >
                      {t.closeBtn}
                    </button>
                  </div>
                  {searchResults.length === 0 ? (
                    <div className="text-xs text-[#9db1a1] py-2">
                      {t.profileNoSearchResults}
                    </div>
                  ) : (
                    <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#0a140f]">
                      {searchResults.map((res) => (
                        <div
                          key={res.publicProfileId}
                          className="p-2.5 flex items-center justify-between gap-2.5"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setProfileModalTargetId(res.publicProfileId)
                            }
                            className="flex items-center gap-2.5 min-w-0 text-start cursor-pointer hover:underline"
                          >
                            <AvatarBadge
                              avatar={res.avatar}
                              seed={res.publicProfileId}
                              displayName={res.displayName}
                              size="sm"
                              status={res.presenceStatus}
                            />
                            <div className="min-w-0">
                              <div className="flex items-baseline gap-1">
                                <span
                                  dir="auto"
                                  className="font-display font-bold text-xs sm:text-sm text-white truncate"
                                >
                                  {res.displayName}
                                </span>
                                <span
                                  dir="ltr"
                                  className="font-mono-num text-[11px] text-[#9db1a1]"
                                >
                                  #{res.playerTag}
                                </span>
                              </div>
                              <div
                                dir="ltr"
                                className="font-mono-num text-[10px] text-[#8ea593]"
                              >
                                {res.publicProfileId} · {t.levelShort} {res.level}
                              </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await ProfileManager.sendFriendRequest(
                                  res.publicProfileId,
                                );
                                setStatusNotice(
                                  t.mpFriendAddedNotice(res.displayName),
                                );
                              } catch (err) {
                                setErrorNotice(
                                  err instanceof Error
                                    ? err.message
                                    : t.mpFriendActionRequiresBackend,
                                );
                              }
                            }}
                            className="min-h-[36px] px-3 rounded-lg bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-xs cursor-pointer shrink-0"
                          >
                            {t.profileSendFriendRequestBtn}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Incoming & Outgoing Friend Requests */}
              {(profileSnap.incomingRequests.length > 0 ||
                profileSnap.outgoingRequests.length > 0) && (
                <div className="space-y-2.5">
                  {profileSnap.incomingRequests.length > 0 && (
                    <div className="rounded-xl border border-[#e5a93c]/35 bg-[#0c1611] divide-y divide-white/10">
                      <div className="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-[#e5a93c]">
                        {t.profileFriendRequestsIncoming} (
                        {profileSnap.incomingRequests.length})
                      </div>
                      {profileSnap.incomingRequests.map((req) => (
                        <div
                          key={req.requestId}
                          className="px-3.5 py-2.5 flex items-center justify-between gap-2"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setProfileModalTargetId(req.fromPublicProfileId)
                            }
                            className="flex items-center gap-2.5 min-w-0 text-start cursor-pointer"
                          >
                            <AvatarBadge
                              avatar={req.fromAvatar}
                              seed={req.fromPublicProfileId}
                              displayName={req.fromDisplayName}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="text-xs sm:text-sm font-bold text-white truncate">
                                {req.fromDisplayName}{' '}
                                <span className="font-mono-num text-[#9db1a1]">
                                  #{req.fromPlayerTag}
                                </span>
                              </div>
                              <div className="font-mono-num text-[10px] text-[#8ea593]">
                                {req.fromPublicProfileId}
                              </div>
                            </div>
                          </button>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                void ProfileManager.respondFriendRequest(
                                  req.requestId,
                                  'accept',
                                )
                              }
                              className="min-h-[36px] px-3 rounded-lg bg-[#e5a93c] text-[#111914] font-display font-bold text-xs cursor-pointer"
                            >
                              {t.mpAcceptBtn}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void ProfileManager.respondFriendRequest(
                                  req.requestId,
                                  'decline',
                                )
                              }
                              className="min-h-[36px] px-2.5 rounded-lg bg-[#182920] border border-[#2f493b] text-xs text-[#e4ece1] cursor-pointer"
                            >
                              {t.mpDeclineBtn}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {profileSnap.outgoingRequests.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-[#0c1611] divide-y divide-white/10">
                      <div className="px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-[#9db1a1]">
                        {t.profileFriendRequestsOutgoing} (
                        {profileSnap.outgoingRequests.length})
                      </div>
                      {profileSnap.outgoingRequests.map((req) => (
                        <div
                          key={req.requestId}
                          className="px-3.5 py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="text-[#dce5d8] truncate">
                            {req.toDisplayName} #{req.toPlayerTag}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              void ProfileManager.respondFriendRequest(
                                req.requestId,
                                'cancel',
                              )
                            }
                            className="px-2.5 py-1 rounded-lg bg-[#182920] border border-[#2f493b] text-[#e4ece1] cursor-pointer"
                          >
                            {t.profileCancelRequestBtn}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {loadingSocial ? (
                <div className="py-8 text-center text-xs sm:text-sm text-[#9db1a1]">
                  {t.loadingDefault}
                </div>
              ) : (() => {
                const onlineFriends = profileSnap.friends;
                const mergedList = [
                  ...onlineFriends.map((f) => ({
                    key: f.publicProfileId,
                    publicProfileId: f.publicProfileId,
                    displayName: f.displayName,
                    playerTag: f.playerTag,
                    avatar: f.avatar,
                    status: f.presenceStatus,
                    roomName: f.currentRoomName ?? f.currentRoomId ?? null,
                    level: f.level,
                  })),
                  ...friends
                    .filter(
                      (lf) =>
                        !onlineFriends.some(
                          (of) =>
                            of.displayName.toLowerCase() ===
                            lf.displayName.toLowerCase(),
                        ),
                    )
                    .map((lf) => ({
                      key: lf.id,
                      publicProfileId: undefined as string | undefined,
                      displayName: lf.displayName,
                      playerTag: '',
                      avatar: undefined,
                      status: lf.status,
                      roomName: lf.currentRoomCode ?? null,
                      level: undefined as number | undefined,
                    })),
                ];

                if (mergedList.length === 0) {
                  return (
                    <div
                      data-testid="mp-friends-empty"
                      className="py-8 px-4 text-center rounded-xl bg-[#0c1611] border border-dashed border-[#2b4436]"
                    >
                      <Users className="w-7 h-7 text-[#e5a93c] mx-auto mb-2.5 opacity-90" />
                      <h4 className="font-display text-sm sm:text-base font-bold text-[#f7faf5]">
                        {t.mpNoFriendsTitle}
                      </h4>
                      <p className="woa-muted-text text-xs sm:text-sm text-[#9db1a1] mt-1 max-w-md mx-auto leading-relaxed">
                        {t.mpNoFriendsDesc}
                      </p>
                    </div>
                  );
                }

                const sortRank = (s: string) =>
                  s === 'in-game' ? 0 : s === 'online' ? 1 : s === 'away' ? 2 : 3;
                const sorted = [...mergedList].sort(
                  (a, b) => sortRank(a.status) - sortRank(b.status),
                );
                const pageSize = 10;
                const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
                const safePage = Math.min(friendsPage, totalPages - 1);
                const pageItems = sorted.slice(
                  safePage * pageSize,
                  (safePage + 1) * pageSize,
                );

                return (
                  <div className="space-y-2.5">
                    <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#0c1611]">
                      {pageItems.map((friend) => (
                        <div
                          key={friend.key}
                          className="p-3.5 flex items-center justify-between gap-3"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (friend.publicProfileId) {
                                setProfileModalTargetId(friend.publicProfileId);
                              }
                            }}
                            className="flex items-center gap-3 min-w-0 text-start cursor-pointer hover:underline"
                          >
                            <AvatarBadge
                              avatar={friend.avatar}
                              seed={friend.publicProfileId ?? friend.key}
                              displayName={friend.displayName}
                              size="sm"
                              status={
                                friend.status === 'in-room'
                                  ? 'in-game'
                                  : friend.status
                              }
                            />
                            <div className="min-w-0">
                              <div className="flex items-baseline gap-1.5">
                                <span
                                  dir="auto"
                                  className="font-display font-bold text-sm text-[#f7faf5] truncate"
                                >
                                  {friend.displayName}
                                </span>
                                {friend.playerTag && (
                                  <span
                                    dir="ltr"
                                    className="font-mono-num text-xs text-[#9db1a1]"
                                  >
                                    #{friend.playerTag}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-[#9db1a1]">
                                {friend.status === 'in-game'
                                  ? t.profileFriendsCategoryInGame
                                  : friend.status === 'online'
                                    ? t.profileFriendsCategoryOnline
                                    : friend.status === 'away'
                                      ? t.profileStatusAway
                                      : t.profileFriendsCategoryOffline}
                                {friend.roomName ? ` · ${friend.roomName}` : ''}
                                {friend.level
                                  ? ` · ${t.levelShort} ${friend.level}`
                                  : ''}
                              </div>
                            </div>
                          </button>
                          <div className="flex items-center gap-2 shrink-0">
                            {activeRoom && (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleInviteFriend(
                                    friend.displayName,
                                    friend.publicProfileId,
                                  )
                                }
                                disabled={sendingInvite}
                                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] disabled:opacity-60 text-[#111914] font-display font-bold text-xs cursor-pointer whitespace-nowrap"
                              >
                                {t.mpInviteBtn}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleRemoveFriend(friend.key)}
                              aria-label={t.mpRemoveFriendBtn}
                              className="min-h-[40px] px-2.5 py-2 rounded-xl bg-[#182920] hover:bg-[#2a1618] border border-[#2f493b] text-xs text-[#c7d6c8] hover:text-[#f4b1a7] cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {totalPages > 1 && (
                      <div className="flex items-center justify-between text-xs text-[#9db1a1]">
                        <button
                          type="button"
                          disabled={safePage === 0}
                          onClick={() => setFriendsPage((p) => Math.max(0, p - 1))}
                          className="min-h-[36px] px-3 rounded-lg bg-[#182920] disabled:opacity-45 border border-[#2f493b] text-[#e4ece1] cursor-pointer"
                        >
                          {t.profilePagePrev}
                        </button>
                        <span className="font-mono-num">
                          {safePage + 1} / {totalPages}
                        </span>
                        <button
                          type="button"
                          disabled={safePage >= totalPages - 1}
                          onClick={() =>
                            setFriendsPage((p) =>
                              Math.min(totalPages - 1, p + 1),
                            )
                          }
                          className="min-h-[36px] px-3 rounded-lg bg-[#182920] disabled:opacity-45 border border-[#2f493b] text-[#e4ece1] cursor-pointer"
                        >
                          {t.profilePageNext}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* 5. INVITES */}
          {subView === 'invites' && (
            <div className="space-y-4" data-testid="mp-invites-view">
              {/* Quick Friends / Invites switcher */}
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#0a140f] border border-[#294034]">
                <button
                  type="button"
                  data-testid="mp-tab-friends-from-invites"
                  onClick={() => openFriends(false)}
                  className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg text-[#b7c8ba] hover:text-white font-display font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Users className="w-4 h-4" />
                  <span>{t.mpFriends}</span>
                </button>
                <button
                  type="button"
                  data-testid="mp-tab-invites-active"
                  onClick={openInvites}
                  className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg bg-[#20382b] text-white font-display font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Mail className="w-4 h-4 text-[#e5a93c]" />
                  <span>{t.mpInvites}</span>
                </button>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  data-testid="mp-refresh-invites-btn"
                  onClick={() => void refreshInvites()}
                  disabled={loadingSocial}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#2f493b] text-xs font-semibold text-[#e4ece1] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-[#e5a93c] ${loadingSocial ? 'animate-spin' : ''}`}
                  />
                  <span>{t.mpRefreshBtn}</span>
                </button>
              </div>

              {invites.length === 0 ? (
                <div
                  data-testid="mp-invites-empty"
                  className="py-8 px-4 text-center rounded-xl bg-[#0c1611] border border-dashed border-[#2b4436]"
                >
                  <Mail className="w-7 h-7 text-[#e5a93c] mx-auto mb-2.5 opacity-90" />
                  <h4 className="font-display text-sm sm:text-base font-bold text-[#f7faf5]">
                    {t.mpNoInvitesTitle}
                  </h4>
                  <p className="woa-muted-text text-xs sm:text-sm text-[#9db1a1] mt-1 max-w-md mx-auto leading-relaxed">
                    {t.mpNoInvitesDesc}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#0c1611]">
                  {invites.map((inv) => (
                    <div
                      key={inv.inviteId}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <AvatarBadge
                          avatar={inv.fromAvatar}
                          seed={inv.fromPublicProfileId ?? inv.fromPlayerName}
                          displayName={inv.fromPlayerName}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="font-display font-bold text-sm text-[#f7faf5] truncate">
                            {inv.roomName}
                          </div>
                          <div className="text-xs text-[#9db1a1] mt-0.5 flex flex-wrap items-center gap-x-2">
                            <span>
                              {inv.fromPlayerName}
                              {inv.fromPlayerTag ? ` #${inv.fromPlayerTag}` : ''}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-num">{inv.roomCode}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-num">
                              {inv.playerCount}/{inv.maxPlayers}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleAcceptInvite(inv.inviteId)}
                          className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-xs cursor-pointer whitespace-nowrap"
                        >
                          {t.mpAcceptBtn}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeclineInvite(inv.inviteId)}
                          className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#2f493b] text-xs font-semibold text-[#e4ece1] cursor-pointer whitespace-nowrap"
                        >
                          {t.mpDeclineBtn}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 6. ROOM LOBBY (Room Summary, Connection Quality, Ready Policy, Player List, Host/Normal Controls) */}
          {subView === 'lobby' && activeRoom && (
            <div className="space-y-4" data-testid="mp-lobby-view">
              <ConnectionStatusBanner
                lang={lang}
                connectionState={connectionState}
                attempt={reconnectAttempt}
                maxAttempts={service.getMaxReconnectAttempts()}
                variant="lobby"
                onRetry={() => void service.retryReconnect()}
                onReturnToMenu={() => void handleLeaveRoom()}
              />
              {/* Authoritative Room Overview Card */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-[#0c1611] border border-[#2b4436] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        data-testid="mp-lobby-room-name"
                        className="font-display text-base sm:text-lg font-bold text-[#f7faf5] truncate"
                      >
                        {activeRoom.roomName}
                      </span>
                      {activeRoom.locked && (
                        <span
                          data-testid="mp-lobby-locked-badge"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#2a1d14] border border-[#e5a93c]/45 text-[11px] font-semibold text-[#f3c66c]"
                        >
                          <Lock className="w-3 h-3" />
                          <span>{t.mpRoomLockedLabel}</span>
                        </span>
                      )}
                      <span
                        data-testid="mp-lobby-connection-quality"
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${localQualityMeta.badgeClass}`}
                      >
                        {localQuality === 'disconnected' ? (
                          <WifiOff className="w-3 h-3 shrink-0" />
                        ) : (
                          <Wifi className="w-3 h-3 shrink-0" />
                        )}
                        <span>
                          {t.mpConnectionQualityLabel}: {localQualityMeta.label}
                          {localLatencyMs !== null && localQuality !== 'disconnected'
                            ? ` (${localLatencyMs} ${t.mpPingUnit})`
                            : ''}
                        </span>
                      </span>
                    </div>
                    <div className="text-xs sm:text-sm text-[#c7d6c8] flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span
                        data-testid="mp-lobby-room-code"
                        dir="ltr"
                        className="font-mono-num font-bold text-[#e5a93c]"
                      >
                        {t.mpRoomLabel}: {activeRoom.roomCode}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span data-testid="mp-lobby-game-mode">
                        {worldTypes.find((w) => w.id === activeRoom.worldType)?.label ??
                          activeRoom.worldType}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span data-testid="mp-lobby-players-count" className="font-mono-num">
                        {t.mpPlayersShort(activeRoom.players.length, activeRoom.maxPlayers)}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#8ea593] flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                      <span
                        data-testid="mp-lobby-world-seed"
                        dir="ltr"
                        className="font-mono-num inline-flex items-center gap-1 text-[#b7cab9]"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-[#e5a93c]" />
                        {t.mpWorldSeedLabel}: #{activeRoom.seed}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {t.mpPrivateRoomLabel}:{' '}
                        {activeRoom.isPrivate ? t.mpToggleOn : t.mpToggleOff}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {t.mpAllowFriendsLabel}:{' '}
                        {activeRoom.allowFriends ? t.mpToggleOn : t.mpToggleOff}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      data-testid="mp-copy-code-btn"
                      onClick={() => void handleCopyRoomCode()}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#2f493b] text-xs font-semibold text-[#e4ece1] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      {copiedCode ? (
                        <Check className="w-3.5 h-3.5 text-[#7fe094]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-[#e5a93c]" />
                      )}
                      <span>{copiedCode ? t.mpCodeCopiedNotice : t.mpCopyCodeBtn}</span>
                    </button>

                    <button
                      type="button"
                      data-testid="mp-lobby-invite-btn"
                      onClick={openInviteFriends}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#2f493b] text-xs font-semibold text-[#e4ece1] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-[#e5a93c]" />
                      <span>{t.mpInviteFriends}</span>
                    </button>
                  </div>
                </div>

                {/* Authoritative Ready Requirement Setting */}
                <div className="pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-[#c7d6c8]">
                    <span className="font-semibold text-[#e6eee4]">
                      {t.mpRequireAllReadyLabel}
                    </span>
                    <span className="text-[11px] text-[#8ea593]">
                      · {t.mpAuthoritativeConfigBadge}
                    </span>
                  </div>
                  {isLocalHost && !activeRoom.locked ? (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        data-testid="mp-lobby-require-ready-on"
                        aria-pressed={requireAllReadyActive}
                        onClick={() => void handleUpdateRequireAllReady(true)}
                        className={`min-h-[34px] px-3 py-1 rounded-lg border text-xs font-display font-bold cursor-pointer transition-colors ${
                          requireAllReadyActive
                            ? 'bg-[#20382b] border-[#e5a93c] text-white'
                            : 'bg-[#0a140f] border-[#294034] text-[#9db1a1] hover:text-white'
                        }`}
                      >
                        {t.mpToggleOn}
                      </button>
                      <button
                        type="button"
                        data-testid="mp-lobby-require-ready-off"
                        aria-pressed={!requireAllReadyActive}
                        onClick={() => void handleUpdateRequireAllReady(false)}
                        className={`min-h-[34px] px-3 py-1 rounded-lg border text-xs font-display font-bold cursor-pointer transition-colors ${
                          !requireAllReadyActive
                            ? 'bg-[#20382b] border-[#e5a93c] text-white'
                            : 'bg-[#0a140f] border-[#294034] text-[#9db1a1] hover:text-white'
                        }`}
                      >
                        {t.mpToggleOff}
                      </button>
                    </div>
                  ) : (
                    <span
                      data-testid="mp-lobby-require-ready-status"
                      className="px-2.5 py-1 rounded-lg bg-[#14221b] border border-[#2b4436] text-xs font-display font-bold text-[#e5a93c]"
                    >
                      {requireAllReadyActive ? t.mpToggleOn : t.mpToggleOff}
                    </span>
                  )}
                </div>
              </div>

              {/* Player List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-display text-sm sm:text-base font-bold text-[#f7faf5]">
                    {t.mpPlayerListTitle}
                  </h3>
                  <span className="font-mono-num text-xs text-[#9db1a1]">
                    {t.mpPlayersShort(activeRoom.players.length, activeRoom.maxPlayers)}
                  </span>
                </div>

                <div
                  data-testid="mp-player-list"
                  className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#0c1611]"
                >
                  {activeRoom.players.map((p) => {
                    const pQuality = getConnectionQuality(
                      p.pingMs,
                      p.connectionQuality !== 'disconnected',
                    );
                    const pMeta = getQualityMeta(pQuality);
                    return (
                      <div
                        key={p.id}
                        data-testid={`mp-player-row-${p.id}`}
                        className="px-3.5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          {/* Player Avatar */}
                          <div data-testid={`mp-player-avatar-${p.id}`}>
                            <AvatarBadge
                              avatar={p.avatar}
                              seed={p.publicProfileId ?? p.id}
                              displayName={p.displayName}
                              size="sm"
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                dir="auto"
                                className="font-display font-bold text-sm text-[#f7faf5] truncate"
                              >
                                {p.displayName}
                              </span>
                              {p.playerTag && (
                                <span
                                  dir="ltr"
                                  className="font-mono-num text-xs text-[#9db1a1]"
                                >
                                  #{p.playerTag}
                                </span>
                              )}
                              {p.isLocal && (
                                <span className="px-1.5 py-0.5 rounded bg-[#1b2e24] text-[10px] font-semibold text-[#c7d6c8]">
                                  {t.mpYouLabel}
                                </span>
                              )}
                              {p.isHost && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#2d2312] border border-[#e5a93c]/40 text-[10px] font-semibold text-[#f3c66c]">
                                  <Crown className="w-2.5 h-2.5" />
                                  {t.mpHostLabel}
                                </span>
                              )}
                              {service.isPlayerMuted(p.id, p.displayName) && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#2b2514] border border-[#e5a93c]/40 text-[10px] font-semibold text-[#f3c66c]">
                                  <VolumeX className="w-2.5 h-2.5" />
                                  {t.mpBadgeMuted}
                                </span>
                              )}
                              {service.isPlayerBlocked(p.id, p.displayName) && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#2a1618] border border-[#e05a47]/45 text-[10px] font-semibold text-[#f4b1a7]">
                                  <Ban className="w-2.5 h-2.5" />
                                  {t.mpBadgeBlocked}
                                </span>
                              )}
                            </div>

                            {/* Ping & Connection Quality */}
                            <div
                              data-testid={`mp-player-ping-${p.id}`}
                              className="text-[11px] text-[#9db1a1] flex items-center gap-1.5 mt-0.5"
                            >
                              <span
                                className={`inline-block w-2 h-2 rounded-full ${pMeta.dotClass}`}
                              />
                              <span className={`font-medium ${pMeta.textClass}`}>
                                {pMeta.label}
                              </span>
                              {typeof p.pingMs === 'number' &&
                                pQuality !== 'disconnected' && (
                                  <span dir="ltr" className="font-mono-num text-[#b7cab9]">
                                    · {p.pingMs} {t.mpPingUnit}
                                  </span>
                                )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0 justify-end">
                          <div
                            data-testid={`mp-player-ready-${p.id}`}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-display font-bold whitespace-nowrap ${
                              p.isReady
                                ? 'bg-[#173222] border-[#7fe094]/45 text-[#8ff0a4]'
                                : 'bg-[#151e19] border-white/10 text-[#9db1a1]'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>{p.isReady ? t.mpReady : t.mpNotReady}</span>
                          </div>

                          <button
                            type="button"
                            data-testid={`mp-player-menu-${p.id}`}
                            onClick={() => setInspectedPlayer(p)}
                            aria-label={t.mpActionViewProfile}
                            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[#16261d] hover:bg-[#21382c] border border-[#2f493b] text-xs font-semibold text-[#dce5d8] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            <MoreHorizontal className="w-4 h-4 text-[#e5a93c]" />
                          </button>

                          {isLocalHost && !p.isLocal && (
                            <>
                              <button
                                type="button"
                                data-testid={`mp-transfer-host-${p.id}`}
                                onClick={() => void handleTransferHost(p.id)}
                                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[#241f12] hover:bg-[#332b18] border border-[#e5a93c]/40 text-[11px] font-display font-bold text-[#f3c66c] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                <Crown className="w-3.5 h-3.5 shrink-0" />
                                <span>{t.mpTransferHost}</span>
                              </button>

                              <button
                                type="button"
                                data-testid={`mp-kick-player-${p.id}`}
                                onClick={() => void handleKickPlayer(p.id)}
                                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[#2a1618] hover:bg-[#3c1d21] border border-[#e05a47]/40 text-[11px] font-display font-bold text-[#f4b1a7] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                <UserMinus className="w-3.5 h-3.5 shrink-0" />
                                <span>{t.mpKickPlayer}</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {Array.from({
                    length: Math.min(
                      4,
                      Math.max(0, activeRoom.maxPlayers - activeRoom.players.length),
                    ),
                  }).map((_, idx) => (
                    <div
                      key={`open-slot-${idx}`}
                      className="px-3.5 py-2.5 flex items-center justify-between text-xs text-[#6f8675]"
                    >
                      <span>{t.mpOpenSlotLabel}</span>
                      <span className="font-mono-num">
                        #{activeRoom.players.length + idx + 1}
                      </span>
                    </div>
                  ))}
                  {activeRoom.maxPlayers - activeRoom.players.length > 4 && (
                    <div className="px-3.5 py-2 text-center text-[11px] text-[#6f8675] font-mono-num">
                      +{activeRoom.maxPlayers - activeRoom.players.length - 4} {t.mpOpenSlotLabel}
                    </div>
                  )}
                </div>
              </div>

              {/* Room Chat Panel */}
              <RoomChatPanel
                lang={lang}
                service={service}
                currentRoom={activeRoom}
                compact
                onInspectPlayer={(player) => setInspectedPlayer(player)}
              />
            </div>
          )}
          {/* 5.5 INVITE FRIENDS VIEW (ROOM CODE, ROOM LINK, COPY CODE, COPY LINK, SHARE) */}
          {subView === 'inviteFriends' && activeRoom && (
            <div className="space-y-4" data-testid="mp-invite-friends-view">
              {/* Room Code Card */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-[#0c1611] border border-[#2b4436] space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#9db1a1]">
                  {t.mpRoomCodeLabel}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div
                    dir="ltr"
                    data-testid="mp-invite-room-code"
                    className="px-3.5 py-2.5 rounded-xl bg-[#0a140f] border border-[#2f493b] font-mono-num text-lg sm:text-xl font-bold tracking-widest text-[#e5a93c] select-all"
                  >
                    {activeRoom.roomCode}
                  </div>
                  <button
                    type="button"
                    data-testid="mp-invite-copy-code-btn"
                    onClick={() => void handleCopyRoomCode()}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#345443] text-xs sm:text-sm font-display font-bold text-[#f2f6ef] inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {copiedCode ? (
                      <Check className="w-4 h-4 text-[#7fe094]" />
                    ) : (
                      <Copy className="w-4 h-4 text-[#e5a93c]" />
                    )}
                    <span>{copiedCode ? t.mpCodeCopiedNotice : t.mpCopyCodeBtn}</span>
                  </button>
                </div>
              </div>

              {/* Room Share Link Card */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-[#0c1611] border border-[#2b4436] space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#9db1a1]">
                  {t.mpRoomLinkLabel}
                </div>
                <div
                  dir="ltr"
                  data-testid="mp-invite-room-link"
                  className="px-3.5 py-2.5 rounded-xl bg-[#0a140f] border border-[#2f493b] font-mono-num text-xs sm:text-sm text-[#e6eee4] break-all select-all"
                >
                  {roomShareLink}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    data-testid="mp-invite-copy-link-btn"
                    onClick={() => void handleCopyRoomLink()}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#345443] text-xs sm:text-sm font-display font-bold text-[#f2f6ef] inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    {copiedLink ? (
                      <Check className="w-4 h-4 text-[#7fe094]" />
                    ) : (
                      <Link2 className="w-4 h-4 text-[#e5a93c]" />
                    )}
                    <span>{copiedLink ? t.mpLinkCopiedNotice : t.mpCopyLinkBtn}</span>
                  </button>

                  <button
                    type="button"
                    data-testid="mp-invite-share-btn"
                    onClick={() => void handleShareRoomLink()}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] text-xs sm:text-sm font-display font-bold inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>{t.mpShareBtn}</span>
                  </button>
                </div>
              </div>

              {/* Direct Friend Invitation */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-[#0c1611] border border-[#2b4436] space-y-3">
                <form onSubmit={handleSendDirectInviteSubmit} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    data-testid="mp-direct-invite-input"
                    maxLength={24}
                    value={directInviteName}
                    onChange={(e) => setDirectInviteName(e.target.value)}
                    placeholder={t.mpInviteTargetPlaceholder}
                    className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-sm text-[#f7faf5] placeholder-[#687e6d]"
                  />
                  <button
                    type="submit"
                    disabled={sendingInvite || !directInviteName.trim()}
                    data-testid="mp-direct-invite-submit-btn"
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#182920] hover:bg-[#22392d] disabled:opacity-50 border border-[#345443] text-xs sm:text-sm font-display font-bold text-[#f2f6ef] inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Send className="w-4 h-4 text-[#e5a93c]" />
                    <span>{t.mpSendInviteBtn}</span>
                  </button>
                </form>

                {friends.length > 0 && (
                  <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#0a140f]">
                    {friends.map((friend) => (
                      <div
                        key={friend.id}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                      >
                        <span className="font-display font-bold text-sm text-[#f7faf5] truncate">
                          {friend.displayName}
                        </span>
                        <button
                          type="button"
                          disabled={sendingInvite}
                          onClick={() => void handleInviteFriend(friend.displayName)}
                          className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] disabled:opacity-60 text-[#111914] font-display font-bold text-xs cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {t.mpInviteBtn}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Contextual Footer Actions */}
        {subView === 'createRoom' && (
          <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-t border-white/10 bg-[#0c1611]/90 flex flex-col sm:flex-row-reverse gap-2.5 shrink-0">
            <button
              type="submit"
              form="mp-create-room-form"
              disabled={creatingRoom}
              data-testid="mp-create-room-submit-btn"
              className="flex-1 min-h-[48px] px-5 py-3 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] disabled:opacity-60 text-[#111914] font-display font-bold text-sm sm:text-base tracking-wide transition-colors cursor-pointer whitespace-nowrap"
            >
              {creatingRoom ? t.mpCreatingRoom : t.mpCreateRoom}
            </button>
            <button
              type="button"
              data-testid="mp-create-room-back-btn"
              onClick={handleNavigateBack}
              className="sm:min-w-[120px] min-h-[48px] px-4 py-3 rounded-xl bg-[#182920] hover:bg-[#22382c] border border-[#2f493b] text-sm font-semibold text-[#e4ece1] transition-colors cursor-pointer whitespace-nowrap"
            >
              {t.backBtn}
            </button>
          </div>
        )}

        {(subView === 'joinRoom' ||
          subView === 'friends' ||
          subView === 'invites' ||
          subView === 'inviteFriends') && (
          <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-t border-white/10 bg-[#0c1611]/90 flex justify-end shrink-0">
            <button
              type="button"
              data-testid="mp-subview-back-btn"
              onClick={handleNavigateBack}
              className="w-full sm:w-auto sm:min-w-[130px] min-h-[48px] px-5 py-3 rounded-xl bg-[#182920] hover:bg-[#22382c] border border-[#2f493b] text-sm font-semibold text-[#e4ece1] transition-colors cursor-pointer whitespace-nowrap"
            >
              {t.backBtn}
            </button>
          </div>
        )}

        {subView === 'lobby' && activeRoom && (
          <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-t border-white/10 bg-[#0c1611]/90 space-y-2.5 shrink-0">
            {isLocalHost && requireAllReadyActive && !allRequiredPlayersReady && (
              <p
                data-testid="mp-lobby-ready-gate-hint"
                className="text-xs text-[#f3c66c] text-center sm:text-start"
              >
                {t.mpWaitingForReadyHint(readyNonHostCount, nonHostPlayers.length)}
              </p>
            )}
            <div className="flex flex-col sm:flex-row-reverse items-stretch sm:items-center gap-2.5">
              {isLocalHost ? (
                <>
                  <button
                    type="button"
                    disabled={!canHostStartGame}
                    data-testid="mp-lobby-start-btn"
                    onClick={() => void handleStartGame()}
                    className="flex-1 min-h-[48px] px-5 py-3 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] disabled:opacity-45 disabled:cursor-not-allowed text-[#111914] font-display font-bold text-sm sm:text-base inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Play className="w-4 h-4 fill-current shrink-0" />
                    <span>{startingGame ? t.mpStartingGame : t.mpStartGame}</span>
                  </button>

                  <button
                    type="button"
                    data-testid="mp-lobby-footer-invite-btn"
                    onClick={openInviteFriends}
                    className="min-h-[48px] px-4 py-3 rounded-xl bg-[#182920] hover:bg-[#22382c] border border-[#2f493b] text-[#e4ece1] font-display font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <UserPlus className="w-4 h-4 text-[#e5a93c] shrink-0" />
                    <span>{t.mpInviteFriends}</span>
                  </button>

                  <button
                    type="button"
                    data-testid="mp-lobby-close-btn"
                    onClick={() => void handleCloseRoom()}
                    className="min-h-[48px] px-4 py-3 rounded-xl bg-[#291718] hover:bg-[#3a1d20] border border-[#e05a47]/40 text-[#f4b1a7] font-display font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>{t.mpCloseRoom}</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    data-testid="mp-lobby-ready-btn"
                    aria-pressed={isLocalReady}
                    onClick={() => void handleToggleReady()}
                    className={`flex-1 min-h-[48px] px-5 py-3 rounded-xl border font-display font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                      isLocalReady
                        ? 'bg-[#20452f] border-[#7fe094]/65 text-[#b5f5c4]'
                        : 'bg-[#182920] hover:bg-[#22382c] border-[#2f493b] text-[#e4ece1]'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{isLocalReady ? t.mpReadyActive : t.mpReady}</span>
                  </button>

                  <button
                    type="button"
                    data-testid="mp-lobby-footer-invite-btn"
                    onClick={openInviteFriends}
                    className="min-h-[48px] px-4 py-3 rounded-xl bg-[#182920] hover:bg-[#22382c] border border-[#2f493b] text-[#e4ece1] font-display font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <UserPlus className="w-4 h-4 text-[#e5a93c] shrink-0" />
                    <span>{t.mpInviteFriends}</span>
                  </button>

                  <button
                    type="button"
                    data-testid="mp-lobby-leave-btn"
                    onClick={() => void handleLeaveRoom()}
                    className="min-h-[48px] px-4 py-3 rounded-xl bg-[#291718] hover:bg-[#3a1d20] border border-[#e05a47]/40 text-[#f4b1a7] font-display font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <DoorOpen className="w-4 h-4 shrink-0" />
                    <span>{t.mpLeaveRoom}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {inspectedPlayer && (
        <PlayerInteractionModal
          lang={lang}
          service={service}
          targetPlayer={inspectedPlayer}
          currentRoom={activeRoom}
          onClose={() => setInspectedPlayer(null)}
          onNotice={(msg) => setStatusNotice(msg)}
          onError={(msg) => setErrorNotice(msg)}
        />
      )}

      {profileModalTargetId !== undefined && (
        <PlayerProfileModal
          lang={lang}
          targetPublicProfileId={profileModalTargetId}
          multiplayerService={service}
          onClose={() => setProfileModalTargetId(undefined)}
          onNotice={(msg) => setStatusNotice(msg)}
        />
      )}

      {needsProfileSetup && (
        <ProfileSetupModal
          lang={lang}
          onComplete={(created) => {
            setPlayerName(created.displayName);
            setNeedsProfileSetup(false);
          }}
          onCancel={onBack}
        />
      )}
    </div>
  );
};
