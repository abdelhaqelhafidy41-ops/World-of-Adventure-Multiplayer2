import * as THREE from 'three';
import {
  DEFAULT_MOBILE_SETTINGS,
  type CameraPerspective,
  type GamePhase,
  type GameSettings,
  type InteractableInfo,
  type MobileControlSettings,
  type PlayerHudSnapshot,
  type UnifiedPlayerInput,
  type WeaponSlotHudView,
  type WorldCollider,
  type WorldLandmark,
} from '../types';
import { ItemManager } from '../inventory/ItemManager';
import { InventoryManager } from '../inventory/InventoryManager';
import { CraftingManager } from '../inventory/CraftingManager';
import type { CraftingRecipeView, InventorySnapshot } from '../inventory/inventoryTypes';
import {
  RESOURCE_NODE_LABELS_AR,
  ROLE_LABELS,
  UI_TEXT,
  type Language,
  getLocalizedVillageName,
  translateInteractableLabel,
  translateInteractableMessage,
} from '../i18n/translations';
import { DialogueEngine } from '../dialogue/DialogueEngine';
import type {
  DialogueSnapshot,
  DialogueWorldBridge,
} from '../dialogue/dialogueTypes';
import { getAllQuestDefinitions } from '../quest/questRegistry';
import { generateAndRegisterProceduralQuests } from '../quest/ProceduralQuestGenerator';
import type { QuestReward, QuestView } from '../quest/questTypes';
import { getBiomeAt, groundHeightAt, DEFAULT_WORLD_SEED, WATER_LEVEL } from '../math/noise';
import {
  findNearestValidLand,
  getWorldGenTelemetry,
  isLand,
  isWater,
} from '../world/WorldPlacementValidator';
import { WorldGenDebugRenderer } from '../world/WorldGenDebugRenderer';
import { createProceduralTextures, type ProceduralTextureSet } from '../world/textures';
import { createSkyAndLighting, type SkyLightingRig } from '../world/SkyAndLighting';
import { WorldManager, type WorldInteractable } from '../world/WorldManager';
import { PlayerCharacter } from '../entities/PlayerCharacter';
import { PlayerController } from '../player/PlayerController';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera';
import { InputManager } from '../input/InputManager';
import { OrientationManager } from '../input/OrientationManager';
import type { MobileInputManager } from '../input/MobileInputManager';
import { SoundEngine } from '../audio/SoundEngine';
import { CombatManager } from '../combat/CombatManager';
import { BowWeapon } from '../combat/weapons/BowWeapon';
import {
  TimeManager,
  type TimePreset,
  type TimeSnapshot,
} from '../world/TimeManager';
import {
  MAX_WEATHER_DURATION_SECONDS,
  MIN_WEATHER_DURATION_SECONDS,
  WeatherManager,
  type WeatherQuality,
  type WeatherSnapshot,
  type WeatherState,
} from '../world/WeatherManager';
import { WeatherEffects } from '../world/WeatherEffects';
import { AtmosphericParticles } from '../world/AtmosphericParticles';
import { PostProcessingPipeline } from './PostProcessing';
import {
  MapManager,
  type MapAnimalEntry,
  type MapVillageEntry,
  type MapWaypoint,
  type MapWorldData,
} from '../world/MapManager';
import { STAMINA_CONFIG_VERSION } from '../player/staminaConfig';
import { SaveManager, generateWorldId, type SaveSourceState } from '../save/SaveManager';
import { LoadManager } from '../save/LoadManager';
import type {
  DifficultyLevel,
  NewWorldOptions,
  SaveGameData,
  SaveGameMeta,
  SaveSlotId,
  SaveSlotSummary,
  WorldType,
} from '../save/saveTypes';
import {
  loadExtendedSettings,
  saveExtendedSettings,
  type CameraSettings,
  type ExtendedGameSettings,
} from '../settings/GameSettingsStore';
import { AIService } from '../ai/AIService';
import type { AIWorldContext } from '../ai/aiTypes';
import { PerformanceMonitor } from './PerformanceMonitor';
import {
  GraphicsQualityManager,
  probeHardwareCapabilities,
  type DebugPerformanceSnapshot,
  type GraphicsSettings,
  type HardwareCapabilityProfile,
  type ResolvedGraphicsProfile,
} from './GraphicsQualityManager';
import { RemotePlayersManager } from '../multiplayer/RemotePlayersManager';
import { ProfileManager } from '../profile/ProfileManager';
import type {
  EntitySyncBatchPayload,
  IMultiplayerService,
  MultiplayerPlayer,
  RoomWorldSnapshotPayload,
} from '../multiplayer/multiplayerTypes';
import {
  ALLOWED_WEAPON_IDS,
  generateNetworkEntityId,
  type GameEventPayload,
  type PlayerNetworkState,
} from '../../../shared/multiplayerProtocol';

export interface EngineCallbacks {
  onPhaseChange: (phase: GamePhase) => void;
  onHudUpdate: (snapshot: PlayerHudSnapshot) => void;
  onPointerLockChange: (locked: boolean) => void;
  onLoadProgress: (progress: number, label: string) => void;
  onInventoryToggle: () => void;
  onMapToggle: () => void;
  onQuestJournalToggle: () => void;
  onPauseToggleCloseOrResume: () => void;
  onWorldNotice: (message: string) => void;
  onInventoryChange: (snapshot: InventorySnapshot) => void;
  onDialogueChange: (snapshot: DialogueSnapshot | null) => void;
  onDebugPerfUpdate?: (snapshot: DebugPerformanceSnapshot) => void;
  onDebugToggle?: () => void;
  onGraphicsProfileChange?: (profile: ResolvedGraphicsProfile) => void;
  onChatToggle?: () => void;
}

interface DustParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  scale: number;
  life: number;
  maxLife: number;
}

export class GameEngine {
  private readonly container: HTMLElement;
  private readonly callbacks: EngineCallbacks;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private isSoftwareGl = false;

  private textures!: ProceduralTextureSet;
  private skyRig!: SkyLightingRig;
  private weatherEffects!: WeatherEffects;
  private atmosphericParticles!: AtmosphericParticles;
  private postProcessing: PostProcessingPipeline | null = null;
  private world!: WorldManager;
  private player!: PlayerCharacter;
  private cameraRig!: ThirdPersonCamera;
  private controller!: PlayerController;
  private combat!: CombatManager;
  private input!: InputManager;
  public readonly sound = new SoundEngine();
  public readonly mapManager = new MapManager();
  public readonly saveManager = new SaveManager();
  public readonly loadManager = new LoadManager();
  public readonly aiService = new AIService();
  public readonly timeManager = new TimeManager({
    initialHour: 8.5,
    fullDayDurationSeconds: 360,
  });
  public readonly weatherManager = new WeatherManager(
    {
      initialWeather: 'clear',
      dynamicEnabled: true,
      minStateDurationSeconds: MIN_WEATHER_DURATION_SECONDS,
      maxStateDurationSeconds: MAX_WEATHER_DURATION_SECONDS,
      transitionDurationSeconds: 14,
      quality: 'medium',
    },
    {
      onLightningStrike: (strike) => {
        if (this.weatherEffects && this.controller) {
          this.weatherEffects.spawnLightningBolt(
            strike.azimuthRad,
            strike.distanceMeters,
            this.controller.position,
          );
        }
      },
      onThunderTrigger: (intensity, distanceMeters) => {
        if (this.phase === 'playing') {
          this.sound.playThunder(intensity, distanceMeters);
        }
      },
    },
  );
  public readonly dialogueEngine: DialogueEngine;
  private readonly dialogueBridge: DialogueWorldBridge;

  private interactables: WorldInteractable[] = [];
  private landmarks: WorldLandmark[] = [];
  private nearbyInteractable: WorldInteractable | null = null;
  private waypoint: MapWaypoint | null = null;
  private lastFogRevealX = Number.NaN;
  private lastFogRevealZ = Number.NaN;

  private readonly itemManager = new ItemManager();
  private readonly inventoryManager = new InventoryManager(this.itemManager, 32);
  private readonly craftingManager = new CraftingManager();

  private playerLevel = 1;
  private playerXp = 0;
  private playerCoins = 0;
  private isSleeping = false;
  private sleepTimer = 0;
  private readonly SLEEP_DURATION_SEC = 5.0;

  private dustPool: DustParticle[] = [];
  private dustMesh!: THREE.InstancedMesh;
  private readonly dustDummy = new THREE.Object3D();
  private dustGeo!: THREE.SphereGeometry;
  private dustMat!: THREE.MeshBasicMaterial;
  private readonly queryCollidersCb = (x: number, z: number) =>
    this.world.queryCollidersNear(x, z);
  private readonly isVillageClearanceCb = (x: number, z: number) =>
    this.world.isInsideVillageClearance(x, z);

  private phase: GamePhase = 'loading';
  private modalOpen = false;
  private touchModeEnabled = false;
  private language: Language = 'en';
  private settings: GameSettings = {
    mouseSensitivity: 1.0,
    muted: false,
    invertY: false,
  };
  private mobileSettings: MobileControlSettings = { ...DEFAULT_MOBILE_SETTINGS };

  // Loop, performance & save management
  private readonly performanceMonitor = new PerformanceMonitor();
  private graphicsManager!: GraphicsQualityManager;
  private debugOverlayEnabled = false;
  private debugEmitTimer = 0;
  private lastRenderTimeMs = 0;
  private cachedActiveObjects = 0;
  private objectCountTimer = 0;

  private readonly clock = new THREE.Clock();
  private elapsed = 0;
  private playTimeSeconds = 0;
  private autosaveTimer = 0;
  private activeSaveSlot: SaveSlotId = 'slot-1';
  private activeWorldName = 'Oakhollow Valley';
  private activeWorldType: WorldType = 'normal';
  private activeDifficulty: DifficultyLevel = 'normal';
  private activeWorldCreatedAtMs = Date.now();
  private hasUnsavedProgress = false;
  private unsavedTimer = 0;
  private multiplayerSessionActive = false;
  private authoritativeMultiplayerConfig: {
    seed: number;
    worldType: WorldType;
    difficulty: DifficultyLevel;
  } | null = null;
  private multiplayerService: IMultiplayerService | null = null;
  private localMultiplayerPlayerId: string | null = null;
  private localNetworkEntityId: string | null = null;
  private remotePlayersManager: RemotePlayersManager | null = null;
  private unsubscribeMultiplayer: (() => void) | null = null;
  private mpSyncTimer = 0;
  private mpKeepaliveTimer = 0;
  private mpEntitySyncTimer = 0;
  private mpWeatherTimeHeartbeatTimer = 0;
  private mpOutboundSeq = 0;
  private mpLastSentDigest = '';
  private mpPendingShootFlag = false;
  private mpPendingAnimState: string | undefined = undefined;
  private isApplyingRemoteTimeWeather = false;
  private isApplyingRemoteWorldEvent = false;
  private lastSyncedWeatherState = '';
  private lastInteractedBed: { id: string; x: number; z: number } | null = null;
  private reducedMotionEnabled = false;
  private vsyncEnabled = true;
  private frameId = 0;
  private disposed = false;
  private unsubscribeOrientation: (() => void) | null = null;
  private lastResizeW = 0;
  private lastResizeH = 0;
  private lastResizePr = 0;
  private hudEmitTimer = 0;
  private questEvalTimer = 0;
  private lastNearbyId: string | null = null;
  private lastCombatTargetKey: string | null = null;
  private lastCooldownActive = false;
  private lastBowCharging = false;
  private lastBowChargePct = -1;
  private showBowTrajectory = true;
  private worldGenDebugEnabled = false;
  private worldGenDebugRenderer: WorldGenDebugRenderer | null = null;
  private biomeDebugEnabled = Boolean(loadExtendedSettings().gameplay.showBiomeDebug);
  private showPlayerNamesSetting = Boolean(
    loadExtendedSettings().gameplay.showPlayerNames,
  );
  private statAccumTimeSec = 0;
  private statAccumDistM = 0;
  private lastStatTrackX: number | null = null;
  private lastStatTrackZ: number | null = null;
  private biomeValidationOk = true;
  private bowFullChargePlayed = false;
  private bowTargetType: 'none' | 'enemy' | 'animal' | 'npc' = 'none';
  private lastBowTargetType: 'none' | 'enemy' | 'animal' | 'npc' = 'none';

  private cameraSettings: CameraSettings = loadExtendedSettings().camera;
  private footstepVolume = loadExtendedSettings().audio.footstepVolume;
  private indicatorX = 50;
  private indicatorY = 50;
  private lastIndicatorX = 50;
  private lastIndicatorY = 50;
  private lastCameraPerspective: CameraPerspective = 'third-person';

  private readonly _camRayOrigin = new THREE.Vector3();
  private readonly _camRayDir = new THREE.Vector3();
  private readonly _bowNockOrigin = new THREE.Vector3();
  private readonly _bowAimTarget = new THREE.Vector3();
  private readonly _bowLaunchVel = new THREE.Vector3();
  private readonly _prevCamSample = new THREE.Vector3();
  private readonly _currCamSample = new THREE.Vector3();
  private readonly _camHitScratch = new THREE.Vector3();
  private readonly _aimRaycaster = new THREE.Raycaster();
  private readonly _aimNdc = new THREE.Vector2();
  private readonly _indicatorWorld = new THREE.Vector3();
  private readonly _camForwardVec = new THREE.Vector3();
  private readonly _camRightVec = new THREE.Vector3();
  private readonly _camUpVec = new THREE.Vector3();

  constructor(
    container: HTMLElement,
    callbacks: EngineCallbacks,
    initialOptions?: { language?: Language; touchMode?: boolean },
  ) {
    this.container = container;
    this.callbacks = callbacks;
    if (initialOptions?.language) {
      this.language = initialOptions.language;
    }
    if (initialOptions?.touchMode !== undefined) {
      this.touchModeEnabled = initialOptions.touchMode;
    }
    this.seedStarterInventory();

    this.dialogueBridge = this.createDialogueBridge();
    this.dialogueEngine = new DialogueEngine(this.dialogueBridge);
    this.dialogueEngine.setLanguage(this.language);
    void this.initialize();
  }

  private seedStarterInventory(): void {
    this.inventoryManager.restoreState({
      capacity: this.inventoryManager.capacity,
      slots: [],
      equippedBySlot: {},
    });
    this.inventoryManager.addItem('compass', 1);
    this.inventoryManager.addItem('journal', 1);
    this.inventoryManager.addItem('ranger-sword', 1);
    this.inventoryManager.addItem('woodland-axe', 1);
    this.inventoryManager.addItem('hunter-bow', 1);
    this.inventoryManager.addItem('arrow', 24);
    this.inventoryManager.equipItemById('ranger-sword');
  }

  private getXpToNextLevel(): number {
    return this.playerLevel * 100;
  }

  private awardXpAndCoins(xpGain: number, coinsGain: number, questTitle?: string): boolean {
    const t = UI_TEXT[this.language];
    const parts: string[] = [];
    if (xpGain > 0) parts.push(`+${xpGain} ${t.xpShort}`);
    if (coinsGain > 0) parts.push(`+${coinsGain} ${t.coinsLabel}`);

    this.playerCoins += coinsGain;
    this.playerXp += xpGain;

    let leveledUp = false;
    while (this.playerXp >= this.getXpToNextLevel()) {
      this.playerXp -= this.getXpToNextLevel();
      this.playerLevel += 1;
      leveledUp = true;
    }

    if (questTitle) {
      const rewardSuffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';
      this.callbacks.onWorldNotice(
        leveledUp
          ? `${t.questCompletedPrefix}: ${questTitle}${rewardSuffix}${t.levelUpSuffix(this.playerLevel)}`
          : `${t.questCompletedPrefix}: ${questTitle}${rewardSuffix}`,
      );
    }
    this.emitHud();
    return leveledUp;
  }

  private emitInventorySnapshot(): void {
    this.callbacks.onInventoryChange(this.inventoryManager.getSnapshot());
  }

  private syncEquipmentBonuses(): void {
    if (!this.controller) return;
    this.controller.applyEquipmentBonuses(this.inventoryManager.getEquippedBonuses());
    this.combat?.playerHealth.setDamageReduction(
      this.inventoryManager.getDamageReductionBonus(),
    );
  }

  private syncEquippedWeaponFromInventory(): void {
    this.cancelActiveBowCharge(false);
    if (!this.combat) return;
    this.combat.equipWeapon(this.inventoryManager.getEquippedWeaponId());
    this.input?.setRangedMode(this.combat.isRangedWeaponEquipped());
    this.emitHud();
  }

  public getCraftingRecipes(): CraftingRecipeView[] {
    return this.craftingManager.getRecipeViews(this.inventoryManager);
  }

  public craftRecipe(recipeId: string): boolean {
    const t = UI_TEXT[this.language];
    const res = this.craftingManager.craft(recipeId, this.inventoryManager);
    if (!res.ok) {
      this.callbacks.onWorldNotice(
        res.reason === 'inventory_full'
          ? t.packFullNotice
          : t.craftedFailIngredients,
      );
      return false;
    }

    this.sound.playInteract();
    if (
      this.multiplayerSessionActive &&
      this.multiplayerService &&
      (res.itemId === 'arrow' || res.itemId === 'bed' || ALLOWED_WEAPON_IDS.has(res.itemId))
    ) {
      this.multiplayerService.sendGameEvent('WORLD_EVENT', {
        kind: 'item_crafted',
        recipeId,
        itemId: res.itemId,
        count: res.count,
      });
    }
    const localizedName = this.itemManager.getName(res.itemId, this.language);
    this.callbacks.onWorldNotice(t.craftedNotice(localizedName, res.count));
    this.dialogueEngine.quests.onItemCrafted(
      res.itemId,
      res.count,
      this.dialogueBridge,
      (msg) => this.callbacks.onWorldNotice(msg),
    );
    this.dialogueEngine.quests.update(this.dialogueBridge, (msg) =>
      this.callbacks.onWorldNotice(msg),
    );
    this.emitInventorySnapshot();
    this.emitHud();
    return true;
  }

  private createDialogueBridge(): DialogueWorldBridge {
    const engine = this;
    return {
      get playerX() {
        return engine.controller ? engine.controller.position.x : 0;
      },
      get playerZ() {
        return engine.controller ? engine.controller.position.z : 0;
      },
      get currentBiome() {
        const px = engine.controller ? engine.controller.position.x : 0;
        const pz = engine.controller ? engine.controller.position.z : 0;
        return getBiomeAt(px, pz);
      },
      getItemCount: (itemId) => this.inventoryManager.getItemCount(itemId),
      getDiscoveredLandmarksCount: () =>
        this.landmarks.filter((l) => l.discovered).length,
      giveItem: (item) => {
        const qty = item.count ?? 1;
        if (!this.itemManager.getItem(item.id)) {
          this.itemManager.registerItem({
            id: item.id,
            name: item.name,
            nameAr: item.name,
            description: item.description,
            descriptionAr: item.description,
            category: item.usable ? 'consumable' : 'quest',
            icon: 'seal',
            stackable: true,
            maxStack: 20,
            usable: Boolean(item.usable),
            droppable: Boolean(item.usable),
            consumeEffect: item.usable ? { health: 30, stamina: 30 } : undefined,
          });
        }
        this.inventoryManager.addItem(item.id, qty);
        this.emitInventorySnapshot();
      },
      consumeItem: (itemId, count) => {
        this.inventoryManager.removeItem(itemId, count);
        this.emitInventorySnapshot();
      },
      healPlayer: (health, stamina) => {
        if (this.controller) {
          if (health > 0) this.controller.heal(health);
          if (stamina > 0) this.controller.restoreStamina(stamina);
          this.emitHud();
        }
      },
      getCoins: () => this.playerCoins,
      repairWeapons: (costCoins) => {
        const t = UI_TEXT[this.language];
        if (this.playerCoins < costCoins) {
          this.callbacks.onWorldNotice(t.repairNeedCoinsNotice(costCoins));
          return false;
        }
        const repaired = this.inventoryManager.repairAllWeapons();
        if (repaired <= 0) {
          this.callbacks.onWorldNotice(t.repairNeedCoinsNotice(costCoins));
          return false;
        }
        this.playerCoins = Math.max(0, this.playerCoins - costCoins);
        this.sound.playInteract();
        this.emitInventorySnapshot();
        this.emitHud();
        this.callbacks.onWorldNotice(t.weaponsRepairedNotice(costCoins));
        return true;
      },
      grantRewards: (reward: QuestReward, questTitle: string) => {
        if (this.controller) {
          if (reward.health) this.controller.heal(reward.health);
          if (reward.stamina) this.controller.restoreStamina(reward.stamina);
        }
        this.awardXpAndCoins(reward.xp ?? 0, reward.coins ?? 0, questTitle);
      },
      notify: (message) => {
        this.callbacks.onWorldNotice(message);
      },
    };
  }

  private async initialize(): Promise<void> {
    this.callbacks.onLoadProgress(12, UI_TEXT[this.language].loadInitWebgl);
    await this.yieldFrame();
    if (this.disposed) return;

    const gpuProbe = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return { isSoftwareGl: true, gpuName: 'Software WebGL' };
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpuName = String(probe.getParameter(param) || 'WebGL2 GPU');
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return {
        isSoftwareGl: /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpuName),
        gpuName,
      };
    })();
    this.isSoftwareGl = gpuProbe.isSoftwareGl;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const maxTextureSize = this.renderer.capabilities.maxTextureSize || 4096;
    const hwProfile = probeHardwareCapabilities(
      this.touchModeEnabled,
      this.isSoftwareGl,
      gpuProbe.gpuName,
      maxTextureSize,
      maxAniso,
    );
    this.graphicsManager = new GraphicsQualityManager(hwProfile);
    const initialProfile = this.graphicsManager.getProfile();

    this.renderer.setPixelRatio(initialProfile.pixelRatio);
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = initialProfile.shadowEnabled && !this.isSoftwareGl;
    this.renderer.shadowMap.type = initialProfile.shadowBasicFilter
      ? THREE.BasicShadowMap
      : THREE.PCFSoftShadowMap;

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      62,
      Math.max(1, this.container.clientWidth) / Math.max(1, this.container.clientHeight),
      0.15,
      initialProfile.cameraFar,
    );

    this.callbacks.onLoadProgress(30, UI_TEXT[this.language].loadTextures);
    await this.yieldFrame();
    if (this.disposed) return;

    this.textures = createProceduralTextures(maxAniso, initialProfile.textureQuality);
    this.skyRig = createSkyAndLighting(this.scene, this.renderer, this.isSoftwareGl);
    this.weatherEffects = new WeatherEffects(this.scene);
    this.atmosphericParticles = new AtmosphericParticles(this.scene);
    if (!this.isSoftwareGl) {
      this.postProcessing = new PostProcessingPipeline(
        this.renderer,
        this.scene,
        this.camera,
        this.container.clientWidth,
        this.container.clientHeight,
        initialProfile.pixelRatio,
        initialProfile.postProcessing,
        initialProfile.antiAliasing,
      );
    }

    this.callbacks.onLoadProgress(44, UI_TEXT[this.language].loadBiomes);
    await this.yieldFrame();
    if (this.disposed) return;

    this.world = new WorldManager(
      this.scene,
      this.textures,
      this.isSoftwareGl,
      undefined,
      (p, _label) => {
        const localized =
          p < 55
            ? UI_TEXT[this.language].loadBiomes
            : p < 85
              ? UI_TEXT[this.language].loadTextures
              : UI_TEXT[this.language].loadSpawn;
        this.callbacks.onLoadProgress(p, localized);
      },
    );
    this.world.npcs.setLanguage(this.language);
    this.world.setBiomeDebugEnabled(this.biomeDebugEnabled);
    this.biomeValidationOk = this.world.validateBiomeMaterialAssignments().valid;
    generateAndRegisterProceduralQuests(
      this.world.seed,
      this.world.village.villages,
      this.world.npcs.npcs,
    );
    if (import.meta.env.DEV && this.worldGenDebugEnabled) {
      this.refreshWorldGenDebugRenderer();
    }
    this.interactables = this.world.interactables;
    this.landmarks = this.world.landmarks;
    this.mapManager.prewarmTerrain(
      this.world.seed,
      this.world.village.site,
      this.getVillageMapEntries(),
    );
    this.mapManager.resetFog();
    this.mapManager.revealAround(0, 4, 195);
    this.lastFogRevealX = 0;
    this.lastFogRevealZ = 4;

    this.callbacks.onLoadProgress(92, UI_TEXT[this.language].loadSpawn);
    await this.yieldFrame();
    if (this.disposed) return;

    this.weatherManager.setSeed(this.world.seed);
    this.sound.setAudioVolumes({ footstepVolume: this.footstepVolume });

    this.player = new PlayerCharacter(this.textures.contactShadowMap);
    this.scene.add(this.player.root);

    this.cameraRig = new ThirdPersonCamera(this.camera);
    this.cameraRig.setColliderQuery(this.queryCollidersCb);
    this.cameraRig.updatePortraitConfig(this.mobileSettings.portraitCamera);
    this.cameraRig.updateCameraConfig({
      distance: this.cameraSettings.distance,
      shoulderHeight: this.cameraSettings.height,
      smoothingScale: this.cameraSettings.smoothing,
    });
    this.cameraRig.setPerspective(this.cameraSettings.perspective, true);
    this.settings.mouseSensitivity = this.cameraSettings.sensitivity;
    this.settings.invertY = this.cameraSettings.invertY;

    this.controller = new PlayerController(this.player, this.cameraRig, {
      queryCollidersNear: (x, z) => this.world.queryCollidersNear(x, z),
      canAttack: () => (this.combat ? this.combat.canPlayerAttack() : true),
      isRangedWeaponEquipped: () =>
        this.combat ? this.combat.isRangedWeaponEquipped() : false,
      isBowAiming: () => Boolean(this.combat?.isChargingBow()),
      getAttackAnimation: () =>
        this.combat
          ? this.combat.getAttackAnimationSpec()
          : { type: 'melee_slash', duration: 0.28 },
      onJump: (pos) => {
        this.sound.playJump();
        this.spawnDustBurst(pos.x, pos.y, pos.z, 5);
      },
      onLand: (pos, strength, inWater) => {
        this.sound.playLand(strength);
        if (!inWater) {
          this.spawnDustBurst(pos.x, pos.y, pos.z, 6);
        }
      },
      onFootstep: (mode) => {
        this.sound.playFootstep(mode);
      },
      onAttack: (pos, yaw) => {
        if (this.isSleeping) return;
        this.sound.playAttackSwing();
        const fx = pos.x + Math.sin(yaw) * 0.9;
        const fz = pos.z + Math.cos(yaw) * 0.9;
        this.spawnDustBurst(fx, pos.y + 0.6, fz, 3);
        const triggered = this.combat?.triggerPlayerAttack(pos, yaw) ?? false;
        if (triggered && this.multiplayerSessionActive && this.multiplayerService) {
          const animSpec = this.combat.getAttackAnimationSpec();
          const weaponId = this.combat.getEquippedWeapon()?.stats.id ?? null;
          this.mpPendingAnimState = animSpec.type;
          this.multiplayerService.sendGameEvent('player:attack', {
            weaponId,
            animType: animSpec.type,
            aimYaw: this.cameraRig?.getYaw() ?? yaw,
          });
        }
      },
      onInteractRequested: () => {
        if (this.isSleeping) return;
        if (this.nearbyInteractable) {
          this.executeInteraction(this.nearbyInteractable);
        }
      },
    });

    this.initDustPool();
    this.resetPlayerPosition();

    this.combat = this.createCombatManager(this.world.seed);
    this.wireWorldAndCombatLinks();
    this.applyResolvedProfile(initialProfile, {
      texturesChanged: false,
      vegetationChanged: false,
      shadowMapSizeChanged: true,
      emitCallback: true,
    });

    this.cameraRig.updateTitleOrbit(0, this.controller.position);
    this.world.update(0, this.controller.position, this.camera, 0.016, undefined, 0.16, 0.62, this.skyRig);

    this.input = new InputManager(this.renderer.domElement, {
      onPauseToggle: () => {
        if (this.isSleeping) return;
        if (this.phase === 'playing' && !this.modalOpen && this.combat?.isChargingBow()) {
          this.cancelActiveBowCharge(true);
          return;
        }
        if (this.modalOpen) {
          this.callbacks.onPauseToggleCloseOrResume?.();
          return;
        }
        if (this.phase === 'playing') {
          this.setPhase('paused');
        } else if (this.phase === 'paused') {
          this.setPhase('playing');
          this.input.requestPointerLock();
        }
      },
      onInventoryToggle: () => {
        if (this.phase === 'playing' && !this.isSleeping) {
          this.callbacks.onInventoryToggle();
        }
      },
      onMapToggle: () => {
        if (!this.isSleeping && (this.phase === 'playing' || this.phase === 'paused')) {
          this.callbacks.onMapToggle();
        }
      },
      onQuestJournalToggle: () => {
        if (this.phase === 'playing' && !this.isSleeping) {
          this.callbacks.onQuestJournalToggle();
        }
      },
      onWeaponSelect: (weaponIndex) => {
        if (this.phase === 'playing' && !this.modalOpen && !this.isSleeping) {
          this.selectOwnedWeapon(weaponIndex);
        }
      },
      onWeaponCycle: () => {
        if (this.phase === 'playing' && !this.modalOpen && !this.isSleeping) {
          this.cycleOwnedWeapon();
        }
      },
      onWeaponUnequip: () => {
        if (this.phase === 'playing' && !this.modalOpen && !this.isSleeping) {
          this.unequipWeapon();
        }
      },
      onCameraCycle: () => {
        if (this.phase === 'playing' && !this.modalOpen && !this.isSleeping) {
          this.cycleCameraPerspective();
        }
      },
      onPointerLockChange: (locked) => {
        this.callbacks.onPointerLockChange(locked);
      },
      onDebugToggle: () => {
        this.callbacks.onDebugToggle?.();
      },
      onChatToggle: () => {
        if (this.phase === 'playing' && !this.isSleeping && this.multiplayerSessionActive) {
          this.callbacks.onChatToggle?.();
        }
      },
    });
    this.input.setTouchMode(this.touchModeEnabled);
    this.syncEquipmentBonuses();
    this.syncEquippedWeaponFromInventory();

    this.unsubscribeOrientation = OrientationManager.subscribe(() =>
      this.handleResize(),
    );
    this.handleResize();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.emitInventorySnapshot();
    this.callbacks.onLoadProgress(100, UI_TEXT[this.language].loadReady);
    this.setPhase('title');
    this.emitHud();
    this.clock.start();
    this.scheduleNextFrame();
  }

  private yieldFrame(): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, 25));
  }

  private initDustPool(): void {
    this.dustGeo = new THREE.SphereGeometry(0.14, 6, 5);
    this.dustMat = new THREE.MeshBasicMaterial({
      color: 0xd9d2be,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const maxDust = 18;
    this.dustMesh = new THREE.InstancedMesh(this.dustGeo, this.dustMat, maxDust);
    this.dustMesh.count = 0;
    this.dustMesh.visible = false;
    this.dustMesh.frustumCulled = false;
    this.dustMesh.matrixAutoUpdate = false;
    this.dustMesh.updateMatrix();
    this.scene.add(this.dustMesh);
    for (let i = 0; i < maxDust; i++) {
      this.dustPool.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        scale: 1,
        life: 0,
        maxLife: 0.45,
      });
    }
  }

  private syncDustInstances(): void {
    if (!this.dustMesh) return;
    let active = 0;
    const dummy = this.dustDummy;
    for (let i = 0; i < this.dustPool.length; i++) {
      const p = this.dustPool[i];
      if (p.life > 0) {
        dummy.position.copy(p.pos);
        dummy.scale.setScalar(p.scale);
        dummy.updateMatrix();
        this.dustMesh.setMatrixAt(active++, dummy.matrix);
      }
    }
    this.dustMesh.count = active;
    this.dustMesh.visible = active > 0;
    if (active > 0) {
      this.dustMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private spawnDustBurst(x: number, y: number, z: number, count: number): void {
    let spawned = 0;
    for (const p of this.dustPool) {
      if (p.life <= 0) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 1.2 + Math.random() * 2.2;
        p.pos.set(x, y + 0.1, z);
        p.scale = 0.7 + Math.random() * 0.7;
        p.vel.set(Math.cos(angle) * spd, 0.8 + Math.random() * 1.1, Math.sin(angle) * spd);
        p.maxLife = 0.35 + Math.random() * 0.25;
        p.life = p.maxLife;
        spawned++;
        if (spawned >= count) break;
      }
    }
    if (spawned > 0) {
      this.syncDustInstances();
    }
  }

  private updateDust(dt: number): void {
    let anyActive = false;
    for (let i = 0; i < this.dustPool.length; i++) {
      const p = this.dustPool[i];
      if (p.life > 0) {
        p.life -= dt;
        if (p.life <= 0) continue;
        anyActive = true;
        p.pos.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(0.92);
        const t = p.life / p.maxLife;
        p.scale = 0.5 + (1 - t) * 1.2;
      }
    }
    if (anyActive || this.dustMesh.visible) {
      this.syncDustInstances();
    }
  }

  public startAdventure(): void {
    this.sound.unlock();
    this.sound.playUiClick();
    this.input?.setTouchMode(this.touchModeEnabled);
    this.setPhase('playing');
    if (!this.touchModeEnabled) {
      this.input?.requestPointerLock();
    }
  }

  public resumeGame(skipPointerLock = false): void {
    this.sound.unlock();
    this.sound.playUiClick();
    this.input?.setTouchMode(this.touchModeEnabled);
    this.setPhase('playing');
    if (!this.touchModeEnabled && !skipPointerLock) {
      this.input?.requestPointerLock();
    }
  }

  public pauseGame(): void {
    if (this.phase === 'playing') {
      this.sound.playUiClick();
      this.setPhase('paused');
    }
  }

  public setModalOpen(open: boolean): void {
    this.modalOpen = open;
    if (open) {
      this.cancelActiveBowCharge(false);
    }
    if (this.input) {
      this.input.setActive(this.phase === 'playing' && !open);
      if (open) {
        this.input.exitPointerLock();
      } else if (this.phase === 'playing' && !this.touchModeEnabled) {
        this.input.requestPointerLock();
      }
    }
  }

  public setTouchMode(enabled: boolean): void {
    this.touchModeEnabled = enabled;
    this.input?.setTouchMode(enabled);
  }

  public getGraphicsSettings(): GraphicsSettings | null {
    return this.graphicsManager ? this.graphicsManager.getSettings() : null;
  }

  public getResolvedGraphicsProfile(): ResolvedGraphicsProfile | null {
    return this.graphicsManager ? this.graphicsManager.getProfile() : null;
  }

  public getHardwareCapabilities(): HardwareCapabilityProfile | null {
    return this.graphicsManager ? this.graphicsManager.getHardware() : null;
  }

  public updateGraphicsSettings(
    partial: Partial<GraphicsSettings>,
  ): ResolvedGraphicsProfile | null {
    if (!this.graphicsManager) return null;
    const res = this.graphicsManager.updateSettings(partial);
    this.performanceMonitor.reset(res.profile.dynamicTargetFps);
    this.applyResolvedProfile(res.profile, {
      texturesChanged: res.texturesChanged,
      vegetationChanged: res.vegetationChanged,
      shadowMapSizeChanged: res.shadowMapSizeChanged,
      emitCallback: true,
    });
    return res.profile;
  }

  public resetGraphicsSettings(): ResolvedGraphicsProfile | null {
    if (!this.graphicsManager) return null;
    const prev = this.graphicsManager.getProfile();
    const next = this.graphicsManager.resetToAuto();
    this.applyResolvedProfile(next, {
      texturesChanged: prev.textureQuality !== next.textureQuality,
      vegetationChanged: Math.abs(prev.vegetationScale - next.vegetationScale) > 0.01,
      shadowMapSizeChanged:
        prev.shadowMapSize !== next.shadowMapSize ||
        prev.shadowBasicFilter !== next.shadowBasicFilter ||
        prev.shadowEnabled !== next.shadowEnabled,
      emitCallback: true,
    });
    return next;
  }

  public setDebugOverlayEnabled(enabled: boolean): void {
    this.debugOverlayEnabled = enabled;
    this.debugEmitTimer = 0;
    if (enabled && this.renderer && this.graphicsManager) {
      this.objectCountTimer = 999;
      this.callbacks.onDebugPerfUpdate?.(this.getDebugPerformanceSnapshot());
    }
  }

  public getDebugPerformanceSnapshot(): DebugPerformanceSnapshot {
    const profile = this.graphicsManager.getProfile();
    const settings = this.graphicsManager.getSettings();
    const hw = this.graphicsManager.getHardware();
    const info = this.renderer.info;

    const perfWithMemory = performance as unknown as {
      memory?: { usedJSHeapSize?: number };
    };
    const heapBytes = perfWithMemory.memory?.usedJSHeapSize;
    const jsHeapMb =
      typeof heapBytes === 'number' && heapBytes > 0
        ? Math.round((heapBytes / (1024 * 1024)) * 10) / 10
        : null;

    return {
      fps: this.performanceMonitor.getSmoothedFps(),
      frameTimeMs: this.performanceMonitor.getSmoothedFrameMs(),
      minFps: this.performanceMonitor.getMinWindowFps(),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      jsHeapMb,
      activeObjects: this.cachedActiveObjects,
      activeNpcs: this.world ? this.world.npcs.getVisibleNpcCount() : 0,
      activeAnimals: this.world ? this.world.wildlife.getVisibleAnimalCount() : 0,
      loadedChunks: this.world ? this.world.chunkManager.getLoadedChunkCount() : 0,
      activeChunks: this.world ? this.world.chunkManager.getActiveChunkCount() : 0,
      renderScale: profile.renderScale,
      pixelRatio: Math.round(profile.pixelRatio * 100) / 100,
      effectiveTier: profile.effectiveTier,
      preset: settings.preset,
      graphicsMode: profile.graphicsMode,
      deviceClass: hw.deviceClass,
      gpuName: hw.gpuName,
      fpsLimit: profile.fpsLimit,
      dynamicLevelOffset: this.graphicsManager.getDynamicLevelOffset(),
      dynamicTargetFps: profile.dynamicTargetFps,
    };
  }

  private applyResolvedProfile(
    profile: ResolvedGraphicsProfile,
    opts: {
      texturesChanged: boolean;
      vegetationChanged: boolean;
      shadowMapSizeChanged: boolean;
      emitCallback: boolean;
    },
  ): void {
    if (!this.renderer || !this.camera) return;

    const vpState = OrientationManager.getState();
    const w = Math.max(1, this.container.clientWidth || vpState.width);
    const h = Math.max(1, this.container.clientHeight || vpState.height);
    if (this.camera.far !== profile.cameraFar) {
      this.camera.far = profile.cameraFar;
      this.camera.updateProjectionMatrix();
    }

    this.renderer.setPixelRatio(profile.pixelRatio);
    this.renderer.setSize(w, h);
    if (this.postProcessing && !this.isSoftwareGl) {
      this.postProcessing.setMode(profile.postProcessing, profile.antiAliasing);
      this.postProcessing.setSize(w, h, profile.pixelRatio);
    }
    this.lastResizeW = w;
    this.lastResizeH = h;
    this.lastResizePr = profile.pixelRatio;

    if (this.textures && opts.texturesChanged) {
      const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
      const oldTex = this.textures;
      const nextTex = createProceduralTextures(
        maxAniso,
        profile.textureQuality,
        oldTex.contactShadowMap,
      );
      this.world?.applyTextures(nextTex);
      oldTex.disposeWorldMaps();
      this.textures = nextTex;
    }

    this.skyRig?.applyGraphicsProfile(this.renderer, profile);
    this.weatherManager.setQuality(profile.weatherQuality);
    this.weatherEffects?.setParticleScale(profile.particleScale);
    this.atmosphericParticles?.setParticleScale(profile.particleScale);
    this.world?.applyGraphicsProfile(
      profile,
      this.controller?.position,
      opts.vegetationChanged,
    );
    this.combat?.applyGraphicsProfile(profile);

    if (this.player) {
      this.player.root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          if (mesh.userData.__origCastShadow === undefined) {
            mesh.userData.__origCastShadow = mesh.castShadow;
            mesh.userData.__origReceiveShadow = mesh.receiveShadow;
          }
          mesh.castShadow =
            Boolean(mesh.userData.__origCastShadow) &&
            profile.shadowEnabled &&
            !this.isSoftwareGl;
          mesh.receiveShadow =
            Boolean(mesh.userData.__origReceiveShadow) &&
            profile.shadowEnabled &&
            !this.isSoftwareGl;
        }
      });
    }

    if (opts.emitCallback) {
      this.callbacks.onGraphicsProfileChange?.(profile);
    }
  }

  public setLanguage(lang: Language): void {
    this.language = lang;
    this.dialogueEngine.setLanguage(lang);
    this.world?.npcs.setLanguage(lang);
    this.emitHud();
  }

  public getMobileInput(): MobileInputManager | null {
    return this.input?.mobile ?? null;
  }

  public getLandmarks(): WorldLandmark[] {
    return this.landmarks.map((l) => ({ ...l }));
  }

  private getVillageMapEntries(): MapVillageEntry[] {
    if (!this.world) return [];
    return this.world.village.villages.map((v) => ({
      id: v.id,
      name: v.name,
      nameAr: v.nameAr,
      kind: v.kind,
      centerX: v.centerX,
      centerZ: v.centerZ,
    }));
  }

  public getWaypoint(): MapWaypoint | null {
    return this.waypoint ? { ...this.waypoint } : null;
  }

  public setWaypoint(wp: MapWaypoint): void {
    this.waypoint = {
      x: Math.round(wp.x),
      z: Math.round(wp.z),
      label: wp.label,
    };
    this.hasUnsavedProgress = true;
    this.sound.playUiClick();
    this.callbacks.onWorldNotice(UI_TEXT[this.language].waypointSetNotice);
    this.emitHud();
  }

  public clearWaypoint(): void {
    if (!this.waypoint) return;
    this.waypoint = null;
    this.hasUnsavedProgress = true;
    this.sound.playUiClick();
    this.callbacks.onWorldNotice(UI_TEXT[this.language].waypointRemovedNotice);
    this.emitHud();
  }

  public getActiveWorldType(): WorldType {
    return this.activeWorldType;
  }

  public getMapData(): MapWorldData | null {
    if (!this.world) return null;
    const px = this.controller?.position.x ?? 0;
    const pz = this.controller?.position.z ?? 0;
    const maxAnimalDistSq = 190 * 190;
    const animals: MapAnimalEntry[] = [];
    for (const a of this.world.wildlife.animals) {
      if (a.isDead) continue;
      const dx = a.position.x - px;
      const dz = a.position.z - pz;
      if (dx * dx + dz * dz <= maxAnimalDistSq) {
        animals.push({
          id: a.id,
          species: a.species,
          x: a.position.x,
          z: a.position.z,
        });
        if (animals.length >= 40) break;
      }
    }

    return {
      seed: this.world.seed,
      villageSite: this.world.village.site,
      villages: this.getVillageMapEntries(),
      landmarks: this.getLandmarks(),
      npcs: this.world.npcs.npcs.map((npc) => ({
        id: npc.id,
        name: npc.getLocalizedName(this.language),
        role: ROLE_LABELS[this.language][npc.role],
        x: npc.position.x,
        z: npc.position.z,
      })),
      animals,
      interactables: this.interactables.map((item) => ({
        id: item.id,
        label: item.label,
        kind: item.kind,
        x: item.x,
        z: item.z,
        collected: item.collected,
      })),
      activeQuests: this.dialogueEngine.quests.getActiveQuests(
        this.dialogueBridge,
      ),
      availableQuests: this.dialogueEngine.quests.getAvailableQuests(
        this.dialogueBridge,
      ),
      questDefs: getAllQuestDefinitions(),
      waypoint: this.waypoint ? { ...this.waypoint } : null,
      getItemCount: (itemId: string) =>
        this.inventoryManager.getItemCount(itemId),
    };
  }

  public getPlayerController(): PlayerController | null {
    return this.controller ?? null;
  }

  public useInventorySlot(slotIndex: number): void {
    if (!this.controller) return;
    const t = UI_TEXT[this.language];
    const res = this.inventoryManager.useSlot(slotIndex, {
      health: this.controller.getHealth(),
      maxHealth: this.controller.getMaxHealth(),
      stamina: this.controller.getStamina(),
      maxStamina: this.controller.getMaxStamina(),
    });

    if (!res.ok) {
      if (res.reason === 'full_stats') {
        this.callbacks.onWorldNotice(t.statsAlreadyFull);
      }
      return;
    }

    const localizedName = this.itemManager.getName(res.definition.id, this.language);

    if (res.action === 'place_bed') {
      if (!this.world) return;
      const pos = this.controller.position;
      const yaw = this.controller.getYaw();
      const bx = pos.x + Math.sin(yaw) * 2.0;
      const bz = pos.z + Math.cos(yaw) * 2.0;
      const placed = this.world.placeBedAt(bx, bz, yaw);
      if (!placed) {
        this.callbacks.onWorldNotice(t.bedCannotPlaceNotice);
        return;
      }
      this.inventoryManager.removeItem('bed', 1);
      this.sound.playInteract();
      this.spawnDustBurst(placed.x, placed.y, placed.z, 5);
      if (this.multiplayerSessionActive && this.multiplayerService) {
        this.multiplayerService.sendGameEvent('BED_PLACED', {
          bedId: placed.id,
          x: Math.round(placed.x * 100) / 100,
          y: Math.round(placed.y * 100) / 100,
          z: Math.round(placed.z * 100) / 100,
          yaw: Math.round(yaw * 1000) / 1000,
        });
      }
      this.callbacks.onWorldNotice(t.bedPlacedNotice);
    } else if (res.action === 'consumed') {
      if (res.healthRestored > 0) this.controller.heal(res.healthRestored);
      if (res.staminaRestored > 0) this.controller.restoreStamina(res.staminaRestored);
      this.sound.playInteract();
      const parts: string[] = [];
      if (res.healthRestored > 0) parts.push(`+${res.healthRestored} ${t.health}`);
      if (res.staminaRestored > 0) parts.push(`+${res.staminaRestored} ${t.stamina}`);
      this.callbacks.onWorldNotice(t.usedItemNotice(localizedName, parts));
    } else if (res.action === 'equipped') {
      this.sound.playUiClick();
      this.syncEquipmentBonuses();
      this.syncEquippedWeaponFromInventory();
      this.callbacks.onWorldNotice(t.equippedNotice(localizedName));
    } else if (res.action === 'unequipped') {
      this.sound.playUiClick();
      this.syncEquipmentBonuses();
      this.syncEquippedWeaponFromInventory();
      this.callbacks.onWorldNotice(t.unequippedNotice(localizedName));
    }

    this.emitInventorySnapshot();
    this.emitHud();
  }

  public selectOwnedWeapon(weaponIndex: number): void {
    const owned = this.inventoryManager.getOwnedWeaponSlots();
    const target = owned[weaponIndex];
    if (!target) return;

    if (!target.equipped) {
      this.useInventorySlot(target.slotIndex);
    } else {
      this.sound.playUiClick();
    }
  }

  public cycleOwnedWeapon(): void {
    const owned = this.inventoryManager.getOwnedWeaponSlots();
    if (owned.length === 0) return;

    const currentIdx = owned.findIndex((s) => s.equipped);
    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % owned.length;
    const nextSlot = owned[nextIdx];
    if (!nextSlot.equipped) {
      this.useInventorySlot(nextSlot.slotIndex);
    }
  }

  public unequipWeapon(): void {
    const unequippedDef = this.inventoryManager.unequipSlotType('weapon');
    if (!unequippedDef) return;

    this.sound.playUiClick();
    this.syncEquippedWeaponFromInventory();
    const t = UI_TEXT[this.language];
    const localizedName = this.itemManager.getName(unequippedDef.id, this.language);
    this.callbacks.onWorldNotice(t.unequippedNotice(localizedName));
    this.emitInventorySnapshot();
    this.emitHud();
  }

  public dropInventorySlot(slotIndex: number, count = 1): void {
    const t = UI_TEXT[this.language];
    const res = this.inventoryManager.dropSlot(slotIndex, count);
    if (!res.ok) {
      if (res.reason === 'not_droppable') {
        this.callbacks.onWorldNotice(t.cannotDropNotice);
      }
      return;
    }

    this.sound.playUiClick();
    this.syncEquipmentBonuses();
    this.syncEquippedWeaponFromInventory();

    const localizedName = this.itemManager.getName(res.itemId, this.language);
    if (this.controller && this.world) {
      const pos = this.controller.position;
      const yaw = this.controller.getYaw();
      const dropX = pos.x + Math.sin(yaw) * 1.35;
      const dropZ = pos.z + Math.cos(yaw) * 1.35;
      const spawned = this.world.spawnWorldPickup(
        dropX,
        dropZ,
        res.itemId,
        res.count,
        res.definition.name,
        undefined,
        true,
      );
      if (this.multiplayerSessionActive && this.multiplayerService) {
        this.multiplayerService.sendGameEvent('ITEM_DROPPED', {
          dropId: spawned.id,
          itemId: res.itemId,
          count: res.count,
          label: res.definition.name,
          x: Math.round(spawned.x * 100) / 100,
          y: Math.round(spawned.y * 100) / 100,
          z: Math.round(spawned.z * 100) / 100,
        });
      }
    }

    this.callbacks.onWorldNotice(t.droppedNotice(localizedName, res.count));
    this.emitInventorySnapshot();
    this.emitHud();
  }

  private createCombatManager(seed: number): CombatManager {
    return new CombatManager({
      scene: this.scene,
      contactShadowMap: this.textures.contactShadowMap,
      isSoftwareGl: this.isSoftwareGl,
      seed,
      playerMaxHealth: this.controller.getMaxHealth(),
      playerPosition: this.controller.position,
      weaponMount: this.player.getWeaponMount(),
      isVillageClearance: (x, z) => this.world.isInsideVillageClearance(x, z),
      onPlayerDamaged: (result, packet) => {
        const dx = this.controller.position.x - packet.sourcePosition.x;
        const dz = this.controller.position.z - packet.sourcePosition.z;
        const dist = Math.hypot(dx, dz) || 1;
        this.controller.applyCombatDamage(
          result.finalAmount,
          (dx / dist) * packet.knockback,
          (dz / dist) * packet.knockback,
          0.2,
        );
        this.sound.playPlayerHurt();
        if (this.multiplayerSessionActive && this.multiplayerService && result.finalAmount > 0) {
          this.multiplayerService.sendGameEvent('player:damage-taken', {
            amount: Math.max(1, Math.round(result.finalAmount)),
            sourceKind: 'enemy',
          });
        }
        this.emitHud();
      },
      onPlayerDefeated: () => {
        this.resetPlayerPosition();
        this.combat.resetPlayerAndAggro();
        if (this.multiplayerSessionActive && this.multiplayerService) {
          this.multiplayerService.sendGameEvent('player:respawn', {});
        }
        this.callbacks.onWorldNotice(UI_TEXT[this.language].playerDefeatedNotice);
        this.emitHud();
      },
      onEnemyHit: (_enemy, result) => {
        this.sound.playHitImpact(result.isCrit);
        this.emitHud();
      },
      onEnemyDefeated: (enemy) => {
        this.sound.playEnemyDefeat();
        const leveledUp = this.awardXpAndCoins(
          enemy.archetype.xpReward,
          enemy.archetype.coinReward,
        );
        this.recordEnemyKill(enemy.archetype.id);
        if (!this.multiplayerSessionActive) {
          ProfileManager.recordGameplayDelta({
            enemiesDefeated: 1,
            xpGained: enemy.archetype.xpReward,
          });
        }
        const t = UI_TEXT[this.language];
        const enemyName =
          this.language === 'ar' ? enemy.archetype.nameAr : enemy.archetype.name;
        const baseMsg = t.enemyDefeatedNotice(
          enemyName,
          enemy.archetype.xpReward,
          enemy.archetype.coinReward,
        );
        this.callbacks.onWorldNotice(
          leveledUp ? `${baseMsg}${t.levelUpSuffix(this.playerLevel)}` : baseMsg,
        );
      },
      onEnemySwing: () => {
        this.sound.playAttackSwing();
      },
    });
  }

  private wireWorldAndCombatLinks(): void {
    if (!this.world || !this.combat) return;
    this.combat.setWildlifeManager(this.world.wildlife);
    this.updateMultiplayerAuthorityMode();
    this.world.npcs.setEnemyCombatProvider(() =>
      this.combat
        ? {
            enemies: this.combat.enemies,
            damageSystem: this.combat.damageSystem,
          }
        : null,
    );
    this.combat.playerHealth.setDamageReduction(
      this.inventoryManager.getDamageReductionBonus(),
    );
    this.combat.setOnPlayerWeaponHit((hitCount) => {
      const res = this.inventoryManager.damageEquippedWeapon(hitCount);
      if (res.damaged) {
        if (res.brokenItemName) {
          this.syncEquippedWeaponFromInventory();
          this.callbacks.onWorldNotice(
            UI_TEXT[this.language].weaponBrokenNotice(res.brokenItemName),
          );
        }
        this.emitInventorySnapshot();
        this.emitHud();
      }
    });
    this.configureCombatMultiplayerCallbacks();
    this.dialogueEngine.quests.setOnQuestUpdated((questId, status, stepIndex) => {
      if (!this.multiplayerSessionActive) {
        if (status === 'completed') {
          ProfileManager.recordGameplayDelta({
            questsCompleted: 1,
            xpGained: 45,
          });
        }
        return;
      }
      if (!this.multiplayerService) return;
      this.multiplayerService.sendGameEvent('QUEST_UPDATED', {
        questId,
        status,
        stepIndex,
      });
    });
    this.combat.setBowWorldCallbacks({
      queryCollidersNear: this.queryCollidersCb,
      onArrowStick: () => {
        this.sound.playArrowStick();
      },
      onHeadshotHit: () => {
        this.callbacks.onWorldNotice(UI_TEXT[this.language].bowHeadshotNotice);
      },
      npcRayTest: (prevPos, nextPos, hitPadding) => {
        const hit = this.world.npcs.rayTestProjectile(prevPos, nextPos, hitPadding);
        if (!hit) return null;
        return {
          id: hit.npc.id,
          role: hit.npc.role,
          isHeadshot: hit.isHeadshot,
          hitPoint: hit.hitPoint,
        };
      },
      onNpcHit: (npcId) => {
        if (!this.controller) return;
        this.world.npcs.reactToArrowHit(
          npcId,
          this.controller.position.x,
          this.controller.position.z,
        );
        this.callbacks.onWorldNotice(UI_TEXT[this.language].bowNpcWarningNotice);
      },
    });
    this.world.wildlife.setCallbacks({
      onAnimalKilled: (animalId, species, position, drops) => {
        if (this.multiplayerSessionActive) {
          if (this.isLocalMultiplayerHost()) {
            for (let i = 0; i < drops.length; i++) {
              const d = drops[i];
              const angle = (i * Math.PI * 2) / Math.max(1, drops.length) + 0.4;
              const offset = drops.length > 1 ? 0.65 : 0;
              const label = this.itemManager.getItem(d.itemId)?.name ?? d.itemId;
              const dropId = `drop_animal_${animalId}_${i}_${Date.now().toString(36)}`;
              const spawned = this.world.spawnWorldPickup(
                position.x + Math.cos(angle) * offset,
                position.z + Math.sin(angle) * offset,
                d.itemId,
                d.quantity,
                label,
                dropId,
                true,
              );
              this.multiplayerService?.sendGameEvent('ITEM_DROPPED', {
                dropId: spawned.id,
                itemId: d.itemId,
                count: d.quantity,
                label,
                x: Math.round(spawned.x * 100) / 100,
                y: Math.round(spawned.y * 100) / 100,
                z: Math.round(spawned.z * 100) / 100,
              });
            }
          }
          return;
        }
        this.sound.playEnemyDefeat();
        this.world.spawnAnimalLootDrops(
          position.x,
          position.z,
          drops.map((d) => ({
            itemId: d.itemId,
            count: d.quantity,
            label: this.itemManager.getItem(d.itemId)?.name ?? d.itemId,
          })),
        );
        this.recordEnemyKill(`animal:${species}`);
        this.awardXpAndCoins(12, 0);
        ProfileManager.recordGameplayDelta({
          animalsDefeated: 1,
          xpGained: 12,
        });
      },
      onPredatorHitPlayer: (_animalId, _species, damage) => {
        if (!this.controller || !this.combat) return;
        if (this.activeWorldType === 'creative' || this.isSleeping) return;
        const res = this.combat.playerHealth.applyDamage(damage, false, false);
        if (!res.applied) return;
        this.controller.applyCombatDamage(res.finalAmount, 0, 0, 0.22);
        this.sound.playPlayerHurt();
        if (this.multiplayerSessionActive && this.multiplayerService && res.finalAmount > 0) {
          this.multiplayerService.sendGameEvent('player:damage-taken', {
            amount: Math.max(1, Math.round(res.finalAmount)),
            sourceKind: 'animal',
          });
        }
        this.emitHud();
        if (res.killed || this.controller.getHealth() <= 0) {
          this.resetPlayerPosition();
          this.combat.resetPlayerAndAggro();
          if (this.multiplayerSessionActive && this.multiplayerService) {
            this.multiplayerService.sendGameEvent('player:respawn', {});
          }
          this.callbacks.onWorldNotice(UI_TEXT[this.language].playerDefeatedNotice);
          this.emitHud();
        }
      },
    });
  }

  private rebuildWorldForSeed(seed: number): void {
    if (!this.world || this.world.seed === seed) return;
    if (
      this.multiplayerSessionActive &&
      this.authoritativeMultiplayerConfig &&
      seed !== this.authoritativeMultiplayerConfig.seed
    ) {
      return;
    }
    this.combat?.dispose();
    this.world.dispose();
    this.nearbyInteractable = null;
    this.lastNearbyId = null;

    this.world = new WorldManager(
      this.scene,
      this.textures,
      this.isSoftwareGl,
      seed,
    );
    this.world.npcs.setLanguage(this.language);
    this.world.setBiomeDebugEnabled(this.biomeDebugEnabled);
    this.biomeValidationOk = this.world.validateBiomeMaterialAssignments().valid;
    generateAndRegisterProceduralQuests(
      this.world.seed,
      this.world.village.villages,
      this.world.npcs.npcs,
    );
    if (import.meta.env.DEV && this.worldGenDebugEnabled) {
      this.refreshWorldGenDebugRenderer();
    }
    this.interactables = this.world.interactables;
    this.landmarks = this.world.landmarks;
    this.mapManager.prewarmTerrain(
      this.world.seed,
      this.world.village.site,
      this.getVillageMapEntries(),
    );
    this.combat = this.createCombatManager(this.world.seed);
    this.wireWorldAndCombatLinks();
    this.weatherManager.setSeed(this.world.seed);
  }

  public getSlotDisplayName(slotId: SaveSlotId): string {
    const t = UI_TEXT[this.language];
    if (slotId === 'autosave') return t.saveSlotAutosave;
    if (slotId === 'slot-1') return t.saveSlotManual(1);
    if (slotId === 'slot-2') return t.saveSlotManual(2);
    if (slotId === 'slot-3') return t.saveSlotManual(3);
    return this.activeWorldName || 'World';
  }

  public getSaveSlots(): SaveSlotSummary[] {
    return this.loadManager.listSaveSlots();
  }

  public getSavedWorlds(): SaveGameMeta[] {
    return this.loadManager.listSavedWorlds();
  }

  public hasAnySave(): boolean {
    return this.loadManager.hasAnySave();
  }

  public getMostRecentSaveMeta(): SaveGameMeta | null {
    return this.loadManager.getMostRecentSaveMeta();
  }

  public getHasUnsavedProgress(): boolean {
    return this.hasUnsavedProgress;
  }

  public getActiveWorldMeta(): {
    worldId: string;
    worldName: string;
    worldType: WorldType;
    difficulty: DifficultyLevel;
  } {
    return {
      worldId: this.activeSaveSlot,
      worldName: this.activeWorldName,
      worldType: this.activeWorldType,
      difficulty: this.activeDifficulty,
    };
  }

  public getCurrentFps(): number {
    return this.performanceMonitor.getSmoothedFps();
  }

  private captureWorldThumbnail(): string | undefined {
    if (!this.renderer || !this.scene || !this.camera || this.isSoftwareGl) {
      return undefined;
    }
    try {
      this.renderer.render(this.scene, this.camera);
      const src = this.renderer.domElement;
      if (!src || src.width === 0 || src.height === 0) return undefined;
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 160;
      thumbCanvas.height = 96;
      const ctx = thumbCanvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.drawImage(src, 0, 0, thumbCanvas.width, thumbCanvas.height);
      return thumbCanvas.toDataURL('image/jpeg', 0.72);
    } catch {
      return undefined;
    }
  }

  private captureSaveSource(includeThumbnail = false): SaveSourceState {
    const pos = this.controller.position;
    const camRot = this.controller.getCameraRotation();
    const worldExport = this.world.exportImportantState();

    return {
      worldId: this.activeSaveSlot,
      worldName: this.activeWorldName,
      worldType: this.activeWorldType,
      difficulty: this.activeDifficulty,
      createdAtMs: this.activeWorldCreatedAtMs,
      thumbnailDataUrl: includeThumbnail ? this.captureWorldThumbnail() : undefined,
      playTimeSeconds: this.playTimeSeconds,
      timeLabel: this.timeManager.getTimeOfDayLabel(this.language),
      player: {
        position: {
          x: Math.round(pos.x * 1000) / 1000,
          y: Math.round(pos.y * 1000) / 1000,
          z: Math.round(pos.z * 1000) / 1000,
        },
        rotation: {
          yaw: this.controller.getYaw(),
          cameraYaw: camRot.cameraYaw,
          cameraPitch: camRot.cameraPitch,
        },
        health: this.controller.getHealth(),
        stamina: this.controller.getStamina(),
        staminaIsInfinite: this.activeWorldType === 'creative',
        staminaConfigVersion: STAMINA_CONFIG_VERSION,
        level: this.playerLevel,
        xp: this.playerXp,
        coins: this.playerCoins,
      },
      inventory: this.inventoryManager.exportState(),
      quests: this.dialogueEngine.quests.exportState(),
      time: this.timeManager.exportState(),
      weather: this.weatherManager.exportState(),
      world: {
        worldSeed: this.world.seed,
        worldType: this.activeWorldType,
        difficulty: this.activeDifficulty,
        discoveredLandmarkIds: worldExport.discoveredLandmarkIds,
        collectedInteractableIds: worldExport.collectedInteractableIds,
        droppedPickups: worldExport.droppedPickups,
        placedBeds: worldExport.placedBeds,
        depletedNodes: worldExport.depletedNodes,
        openedChestIds: worldExport.openedChestIds,
        killedAnimalIds: this.world.wildlife.exportKilledAnimalIds(),
        dialogueFlags: this.dialogueEngine.exportFlags(),
        defeatedEnemyIds: this.combat.exportDefeatedEnemyIds(),
        fogOfWar: this.mapManager.exportFogState(),
        waypoint: this.waypoint ? { ...this.waypoint } : null,
        npcStates: this.world.npcs.npcs.map((npc) => ({
          id: npc.id,
          x: Math.round(npc.position.x * 100) / 100,
          z: Math.round(npc.position.z * 100) / 100,
          yaw: Math.round(npc.rig.root.rotation.y * 1000) / 1000,
        })),
      },
      camera: {
        ...this.cameraSettings,
        perspective:
          this.cameraRig?.getPerspective() ?? this.cameraSettings.perspective,
        sensitivity: this.settings.mouseSensitivity,
        invertY: this.settings.invertY,
      },
      audio: {
        footstepVolume: this.footstepVolume,
      },
    };
  }

  public isMultiplayerSession(): boolean {
    return this.multiplayerSessionActive;
  }

  public saveCurrentWorld(silent = false): boolean {
    if (!this.controller || !this.world || this.multiplayerSessionActive) return false;
    const targetSlot = this.activeSaveSlot || 'slot-1';
    const res = this.saveManager.saveToSlot(
      targetSlot,
      this.captureSaveSource(!silent),
    );
    if (!res.ok) {
      if (!silent) {
        this.callbacks.onWorldNotice(UI_TEXT[this.language].saveFailedNotice);
      }
      return false;
    }
    this.hasUnsavedProgress = false;
    this.unsavedTimer = 0;
    if (!silent) {
      this.sound.playInteract();
      this.callbacks.onWorldNotice(
        UI_TEXT[this.language].savedNotice(this.activeWorldName),
      );
    }
    return true;
  }

  public saveToSlot(slotId: SaveSlotId, silent = false): boolean {
    if (!this.controller || !this.world || this.multiplayerSessionActive) return false;
    const res = this.saveManager.saveToSlot(
      slotId,
      this.captureSaveSource(!silent),
    );
    if (!res.ok) {
      if (!silent) {
        this.callbacks.onWorldNotice(UI_TEXT[this.language].saveFailedNotice);
      }
      return false;
    }
    if (slotId !== 'autosave') {
      this.activeSaveSlot = slotId;
    }
    this.hasUnsavedProgress = false;
    this.unsavedTimer = 0;
    if (!silent) {
      this.sound.playInteract();
      this.callbacks.onWorldNotice(
        UI_TEXT[this.language].savedNotice(this.getSlotDisplayName(slotId)),
      );
    }
    return true;
  }

  public quickSave(): boolean {
    return this.saveCurrentWorld(false);
  }

  public setMultiplayerService(service: IMultiplayerService | null): void {
    this.multiplayerService = service;
  }

  private isLocalMultiplayerHost(): boolean {
    if (!this.multiplayerSessionActive || !this.multiplayerService) return false;
    const room = this.multiplayerService.getRoomState();
    const localId =
      this.localMultiplayerPlayerId ?? this.multiplayerService.getLocalPlayerId();
    return Boolean(room && localId && room.hostId === localId);
  }

  private updateMultiplayerAuthorityMode(): void {
    const isHost = this.isLocalMultiplayerHost();
    const remoteControlled = this.multiplayerSessionActive && !isHost;
    this.world?.npcs.setNetworkRemoteControlled(remoteControlled);
    this.world?.wildlife.setNetworkRemoteControlled(remoteControlled);
    this.combat?.setNetworkRemoteControlled(remoteControlled);
    if (this.multiplayerSessionActive) {
      this.weatherManager.setDynamicEnabled(isHost);
    }
  }

  private teardownMultiplayerSync(): void {
    this.unsubscribeMultiplayer?.();
    this.unsubscribeMultiplayer = null;
    this.remotePlayersManager?.dispose();
    this.remotePlayersManager = null;
    this.localMultiplayerPlayerId = null;
    this.localNetworkEntityId = null;
    this.mpSyncTimer = 0;
    this.mpKeepaliveTimer = 0;
    this.mpEntitySyncTimer = 0;
    this.mpWeatherTimeHeartbeatTimer = 0;
    this.mpOutboundSeq = 0;
    this.mpLastSentDigest = '';
    this.mpPendingShootFlag = false;
    this.mpPendingAnimState = undefined;
    this.lastSyncedWeatherState = '';
    this.lastInteractedBed = null;
    this.updateMultiplayerAuthorityMode();
    this.combat?.setMultiplayerCallbacks({ multiplayerAuthoritative: false });
  }

  private configureCombatMultiplayerCallbacks(): void {
    this.combat?.setMultiplayerCallbacks({
      multiplayerAuthoritative: this.multiplayerSessionActive,
      npcStrikeTest: (origin, forwardDir, range, minCos) =>
        this.world.npcs
          .findNpcsInStrikeArc(origin, forwardDir, range, minCos)
          .map((n) => ({
            id: n.id,
            role: n.role,
            position: n.position,
            hitHeight: n.getHitHeight(),
          })),
      onMultiplayerMeleeHit: (hit) => {
        if (!this.multiplayerSessionActive || !this.multiplayerService) return;
        this.multiplayerService.sendGameEvent('COMBAT_HIT', {
          ...(hit.attackId ? { attackId: hit.attackId } : {}),
          weaponId: hit.weaponId,
          targetKind: hit.targetKind,
          targetId: hit.targetId,
          archetype: hit.archetype,
          x: Math.round(hit.x * 100) / 100,
          y: Math.round(hit.y * 100) / 100,
          z: Math.round(hit.z * 100) / 100,
          isCrit: hit.isCrit,
        });
      },
      onMultiplayerArrowFired: (shot) => {
        if (!this.multiplayerSessionActive || !this.multiplayerService) return;
        this.multiplayerService.sendGameEvent('ARROW_FIRED', {
          arrowId: shot.arrowId,
          weaponId: shot.weaponId,
          originX: Math.round(shot.originX * 1000) / 1000,
          originY: Math.round(shot.originY * 1000) / 1000,
          originZ: Math.round(shot.originZ * 1000) / 1000,
          dirX: Math.round(shot.dirX * 1000) / 1000,
          dirY: Math.round(shot.dirY * 1000) / 1000,
          dirZ: Math.round(shot.dirZ * 1000) / 1000,
          bowCharge: Math.round(shot.bowCharge * 100) / 100,
        });
      },
      onMultiplayerProjectileHit: (hit) => {
        if (!this.multiplayerSessionActive || !this.multiplayerService) return;
        this.multiplayerService.sendGameEvent('PROJECTILE_HIT', {
          arrowId: hit.arrowId,
          targetKind: hit.targetKind,
          targetId: hit.targetId,
          ...(hit.archetype ? { archetype: hit.archetype } : {}),
          x: Math.round(hit.x * 1000) / 1000,
          y: Math.round(hit.y * 1000) / 1000,
          z: Math.round(hit.z * 1000) / 1000,
          isHeadshot: hit.isHeadshot,
        });
      },
    });
  }

  private setupMultiplayerSync(
    players: MultiplayerPlayer[],
    localPlayerId: string | null,
  ): void {
    this.teardownMultiplayerSync();
    if (!this.scene || !this.textures) return;

    this.localMultiplayerPlayerId = localPlayerId;
    this.localNetworkEntityId = localPlayerId
      ? generateNetworkEntityId(localPlayerId)
      : null;
    if (this.player && this.localNetworkEntityId) {
      this.player.root.userData.networkEntityId = this.localNetworkEntityId;
    }

    this.remotePlayersManager = new RemotePlayersManager(
      this.scene,
      this.textures.contactShadowMap,
      this.isSoftwareGl,
    );
    this.remotePlayersManager.setShowPlayerNames(this.showPlayerNamesSetting);
    this.remotePlayersManager.syncRoster(players, localPlayerId);
    this.configureCombatMultiplayerCallbacks();
    this.updateMultiplayerAuthorityMode();
    this.lastSyncedWeatherState = this.weatherManager.getSnapshot().currentState;

    if (!this.multiplayerService) return;
    this.unsubscribeMultiplayer = this.multiplayerService.subscribe((ev) => {
      if (!this.multiplayerSessionActive) return;

      if (ev.type === 'player-state') {
        this.remotePlayersManager?.pushPlayerState(ev.playerId, ev.state);
      } else if (ev.type === 'game-event') {
        this.remotePlayersManager?.handleGameEvent(ev.playerId, ev.payload);
        this.handleRemoteMultiplayerGameEvent(ev.playerId, ev.payload);
      } else if (ev.type === 'entity-sync') {
        this.applyRemoteEntitySync(ev.payload);
      } else if (ev.type === 'world-snapshot') {
        this.applyRemoteWorldSnapshot(ev.snapshot);
      } else if (ev.type === 'connection-changed') {
        if (ev.state === 'connected') {
          this.syncLocalMultiplayerState(0.05, true);
        }
      } else if (ev.type === 'host-transferred') {
        this.updateMultiplayerAuthorityMode();
      } else if (ev.type === 'room-updated') {
        if (!ev.room) {
          this.teardownMultiplayerSync();
        } else {
          this.remotePlayersManager?.syncRoster(
            ev.room.players,
            this.localMultiplayerPlayerId,
          );
          this.updateMultiplayerAuthorityMode();
        }
      } else if (ev.type === 'player-vitals') {
        if (ev.vitals.playerId === this.localMultiplayerPlayerId) {
          if (this.controller && this.combat) {
            this.controller.syncAuthoritativeHealth(ev.vitals.health);
            this.combat.syncPlayerStats(ev.vitals.health, ev.vitals.maxHealth);
            if (ev.vitals.isDead) {
              this.resetPlayerPosition();
              this.combat.resetPlayerAndAggro();
              this.multiplayerService?.sendGameEvent('player:respawn', {});
              this.callbacks.onWorldNotice(
                UI_TEXT[this.language].playerDefeatedNotice,
              );
            }
            this.emitHud();
          }
        } else {
          this.remotePlayersManager?.applyVitals(ev.vitals);
        }
      } else if (ev.type === 'position-correction') {
        if (this.controller) {
          this.controller.applyAuthoritativePositionCorrection(
            ev.correction.x,
            ev.correction.y,
            ev.correction.z,
          );
          this.emitHud();
        }
      } else if (ev.type === 'error') {
        if (ev.code === 'NO_AMMO' && this.activeWorldType !== 'creative') {
          this.reconcileLocalArrowCount(0);
          this.sound.playBowEmpty();
          this.callbacks.onWorldNotice(UI_TEXT[this.language].bowNoArrowsNotice);
        } else if (
          ev.code === 'WEAPON_NOT_OWNED' ||
          ev.code === 'CHEST_ALREADY_OPENED' ||
          ev.code === 'ALREADY_COLLECTED' ||
          ev.code === 'RESOURCE_DEPLETED'
        ) {
          this.callbacks.onWorldNotice(ev.message);
        }
      }
    });
  }

  private reconcileLocalArrowCount(targetCount: number): void {
    if (this.activeWorldType === 'creative') return;
    const clamped = Math.max(0, Math.round(targetCount));
    const current = this.inventoryManager.getItemCount('arrow');
    if (clamped < current) {
      this.inventoryManager.removeItem('arrow', current - clamped);
      this.emitInventorySnapshot();
      this.emitHud();
    } else if (clamped > current) {
      this.inventoryManager.addItem('arrow', clamped - current);
      this.emitInventorySnapshot();
      this.emitHud();
    }
  }

  private resolveAttackerCoords(
    playerId: string | undefined,
    fallbackX?: number,
    fallbackZ?: number,
  ): { x?: number; z?: number } {
    if (playerId && playerId === this.localMultiplayerPlayerId && this.controller) {
      return { x: this.controller.position.x, z: this.controller.position.z };
    }
    if (playerId && this.multiplayerService) {
      const p = this.multiplayerService
        .getRoomState()
        ?.players.find((pl) => pl.id === playerId);
      if (p?.state) {
        return { x: p.state.x, z: p.state.z };
      }
    }
    return { x: fallbackX, z: fallbackZ };
  }

  private isValidWeatherState(val: string): val is WeatherState {
    return (
      val === 'clear' ||
      val === 'cloudy' ||
      val === 'overcast' ||
      val === 'rain' ||
      val === 'storm' ||
      val === 'fog'
    );
  }

  private applyRemoteWorldSnapshot(snap: RoomWorldSnapshotPayload): void {
    if (!this.world || !this.combat) return;
    this.isApplyingRemoteWorldEvent = true;
    this.isApplyingRemoteTimeWeather = true;
    try {
      for (const chestId of snap.openedChests) {
        this.world.markChestOpenedRemote(chestId);
      }
      for (const pickupId of snap.collectedPickups) {
        this.world.markPickupCollectedRemote(pickupId);
      }
      const nowMs = Date.now();
      for (const r of snap.depletedResources) {
        const remainSec = Math.max(0, (r.regenAtMs - nowMs) / 1000);
        this.world.applyResourceNodeState(
          r.id,
          r.usesRemaining,
          r.usesRemaining <= 0,
          this.elapsed + remainSec,
        );
      }
      for (const door of snap.doors) {
        this.world.setDoorOpen(door.id, door.isOpen);
      }
      for (const bed of snap.placedBeds) {
        if (!this.world.interactables.some((it) => it.id === bed.id)) {
          this.world.placeBedAt(bed.x, bed.z, bed.yaw, bed.id);
        }
      }
      for (const drop of snap.droppedItems) {
        if (!this.world.interactables.some((it) => it.id === drop.id)) {
          this.world.spawnWorldPickup(
            drop.x,
            drop.z,
            drop.itemId,
            drop.count,
            drop.label,
            drop.id,
            true,
          );
        }
      }
      for (const lmId of snap.discoveredLandmarks) {
        const lm = this.landmarks.find((l) => l.id === lmId);
        if (lm && !lm.discovered) {
          lm.discovered = true;
          this.mapManager.revealAround(lm.x, lm.z, 95);
        }
      }
      for (const q of snap.quests) {
        this.dialogueEngine.quests.applyRemoteQuestUpdate(
          q.questId,
          q.status,
          q.stepIndex,
          this.dialogueBridge,
        );
      }
      for (const dead of snap.deadEntities) {
        if (dead.kind === 'enemy') {
          this.combat.applyAuthoritativeEnemyDamage(dead.id, 0, 100, true);
        } else if (dead.kind === 'animal') {
          this.world.wildlife.applyAuthoritativeDamage(dead.id, 0, 100, true, false);
        } else if (dead.kind === 'npc') {
          this.world.npcs.applyAuthoritativeDamage(dead.id, 0, 100, true);
        }
      }
      if (typeof snap.worldHours === 'number' && Number.isFinite(snap.worldHours)) {
        this.timeManager.setWorldHours(snap.worldHours);
      }
      if (typeof snap.weather === 'string' && this.isValidWeatherState(snap.weather)) {
        this.lastSyncedWeatherState = snap.weather;
        this.weatherManager.setWeather(snap.weather, true);
      }
      if (typeof snap.ammoCount === 'number' && Number.isFinite(snap.ammoCount)) {
        this.reconcileLocalArrowCount(snap.ammoCount);
      }
      this.syncWorldTimeImmediate();
      this.emitInventorySnapshot();
      this.emitHud();
    } finally {
      this.isApplyingRemoteWorldEvent = false;
      this.isApplyingRemoteTimeWeather = false;
    }
  }

  private applyRemoteEntitySync(payload: EntitySyncBatchPayload): void {
    if (!this.world || !this.combat) return;
    if (this.isLocalMultiplayerHost()) return;

    if (payload.entities.length > 0) {
      const npcDeltas = payload.entities.filter((e) => e.kind === 'npc');
      const animalDeltas = payload.entities.filter((e) => e.kind === 'animal');
      const enemyDeltas = payload.entities.filter((e) => e.kind === 'enemy');
      if (npcDeltas.length > 0) this.world.npcs.applySyncDeltas(npcDeltas);
      if (animalDeltas.length > 0) this.world.wildlife.applySyncDeltas(animalDeltas);
      if (enemyDeltas.length > 0) this.combat.applySyncDeltas(enemyDeltas);
    }

    if (typeof payload.worldHours === 'number' && Number.isFinite(payload.worldHours)) {
      const diff = Math.abs(payload.worldHours - this.timeManager.getWorldHours());
      if (diff > 0.04 && diff < 23.96) {
        this.timeManager.setWorldHours(payload.worldHours);
      }
    }
    if (
      typeof payload.weather === 'string' &&
      this.isValidWeatherState(payload.weather) &&
      payload.weather !== this.lastSyncedWeatherState
    ) {
      this.isApplyingRemoteTimeWeather = true;
      try {
        this.lastSyncedWeatherState = payload.weather;
        this.weatherManager.setWeather(payload.weather, false);
      } finally {
        this.isApplyingRemoteTimeWeather = false;
      }
    }
  }

  private handleRemoteMultiplayerGameEvent(
    senderPlayerId: string,
    payload: GameEventPayload,
  ): void {
    if (!this.world || !this.combat) return;
    const data = payload.data ?? {};
    const t = UI_TEXT[this.language];

    switch (payload.event) {
      case 'ARROW_FIRED': {
        const shooterId =
          typeof data.shooterId === 'string' ? data.shooterId : senderPlayerId;
        if (shooterId === this.localMultiplayerPlayerId) {
          if (typeof data.ammoCount === 'number' && Number.isFinite(data.ammoCount)) {
            this.reconcileLocalArrowCount(data.ammoCount);
          }
          return;
        }
        const arrowId = typeof data.arrowId === 'string' ? data.arrowId : '';
        if (!arrowId) return;
        this.remotePlayersManager?.spawnSyncedArrow({
          arrowId,
          shooterId,
          weaponId: typeof data.weaponId === 'string' ? data.weaponId : undefined,
          bowCharge: typeof data.bowCharge === 'number' ? data.bowCharge : 1,
          originX: typeof data.originX === 'number' ? data.originX : 0,
          originY: typeof data.originY === 'number' ? data.originY : 1.5,
          originZ: typeof data.originZ === 'number' ? data.originZ : 0,
          dirX: typeof data.dirX === 'number' ? data.dirX : 0,
          dirY: typeof data.dirY === 'number' ? data.dirY : 0,
          dirZ: typeof data.dirZ === 'number' ? data.dirZ : 1,
          speed: typeof data.speed === 'number' ? data.speed : 32,
          gravity: typeof data.gravity === 'number' ? data.gravity : 9.8,
        });
        break;
      }

      case 'PROJECTILE_HIT': {
        const arrowId = typeof data.arrowId === 'string' ? data.arrowId : '';
        const targetKind =
          typeof data.targetKind === 'string' ? data.targetKind : 'world';
        const x = typeof data.x === 'number' ? data.x : 0;
        const y = typeof data.y === 'number' ? data.y : 0;
        const z = typeof data.z === 'number' ? data.z : 0;
        if (arrowId) {
          this.remotePlayersManager?.resolveSyncedArrowHit({
            arrowId,
            x,
            y,
            z,
            targetKind,
          });
        }
        if (
          targetKind === 'world' &&
          senderPlayerId !== this.localMultiplayerPlayerId &&
          this.controller
        ) {
          const dist = Math.hypot(
            this.controller.position.x - x,
            this.controller.position.z - z,
          );
          if (dist < 32) {
            this.sound.playArrowStick();
          }
        }
        break;
      }

      case 'ENEMY_DAMAGED': {
        const targetId = typeof data.targetId === 'string' ? data.targetId : '';
        if (!targetId) return;
        const attackerId =
          typeof data.attackerId === 'string' ? data.attackerId : senderPlayerId;
        const hp = typeof data.hp === 'number' ? data.hp : 0;
        const maxHp = typeof data.maxHp === 'number' ? data.maxHp : 100;
        const isCrit = Boolean(data.isCrit);
        const x = typeof data.x === 'number' ? data.x : 0;
        const y = typeof data.y === 'number' ? data.y : 1;
        const z = typeof data.z === 'number' ? data.z : 0;
        const atkCoords = this.resolveAttackerCoords(attackerId, x, z);
        this.combat.applyAuthoritativeEnemyDamage(
          targetId,
          hp,
          maxHp,
          false,
          atkCoords.x,
          atkCoords.z,
        );
        this.combat.spawnHitSparks(x, y, z, isCrit ? 7 : 4);
        if (attackerId === this.localMultiplayerPlayerId) {
          this.sound.playHitImpact(isCrit);
          this.emitHud();
        }
        break;
      }

      case 'ENEMY_DIED': {
        const targetId = typeof data.targetId === 'string' ? data.targetId : '';
        if (!targetId) return;
        const killerId =
          typeof data.killerId === 'string' ? data.killerId : senderPlayerId;
        const x = typeof data.x === 'number' ? data.x : 0;
        const y = typeof data.y === 'number' ? data.y : 0;
        const z = typeof data.z === 'number' ? data.z : 0;
        const atkCoords = this.resolveAttackerCoords(killerId, x, z);
        const res = this.combat.applyAuthoritativeEnemyDamage(
          targetId,
          0,
          100,
          true,
          atkCoords.x,
          atkCoords.z,
        );
        if (res?.justKilled) {
          this.spawnDustBurst(x, y, z, 6);
          if (killerId === this.localMultiplayerPlayerId) {
            this.sound.playEnemyDefeat();
            const leveledUp = this.awardXpAndCoins(
              res.enemy.archetype.xpReward,
              res.enemy.archetype.coinReward,
            );
            this.recordEnemyKill(res.enemy.archetype.id);
            const enemyName =
              this.language === 'ar'
                ? res.enemy.archetype.nameAr
                : res.enemy.archetype.name;
            const baseMsg = t.enemyDefeatedNotice(
              enemyName,
              res.enemy.archetype.xpReward,
              res.enemy.archetype.coinReward,
            );
            this.callbacks.onWorldNotice(
              leveledUp ? `${baseMsg}${t.levelUpSuffix(this.playerLevel)}` : baseMsg,
            );
          }
          this.emitHud();
        }
        break;
      }

      case 'ANIMAL_DAMAGED': {
        const targetId = typeof data.targetId === 'string' ? data.targetId : '';
        if (!targetId) return;
        const attackerId =
          typeof data.attackerId === 'string' ? data.attackerId : senderPlayerId;
        const hp = typeof data.hp === 'number' ? data.hp : 0;
        const maxHp = typeof data.maxHp === 'number' ? data.maxHp : 50;
        const isCrit = Boolean(data.isCrit);
        const x = typeof data.x === 'number' ? data.x : 0;
        const y = typeof data.y === 'number' ? data.y : 0.7;
        const z = typeof data.z === 'number' ? data.z : 0;
        const atkCoords = this.resolveAttackerCoords(attackerId, x, z);
        this.world.wildlife.applyAuthoritativeDamage(
          targetId,
          hp,
          maxHp,
          false,
          false,
          atkCoords.x,
          atkCoords.z,
        );
        this.combat.spawnHitSparks(x, y, z, isCrit ? 6 : 4);
        if (attackerId === this.localMultiplayerPlayerId) {
          this.sound.playHitImpact(isCrit);
          this.emitHud();
        }
        break;
      }

      case 'ANIMAL_DIED': {
        const targetId = typeof data.targetId === 'string' ? data.targetId : '';
        if (!targetId) return;
        const killerId =
          typeof data.killerId === 'string' ? data.killerId : senderPlayerId;
        const x = typeof data.x === 'number' ? data.x : 0;
        const y = typeof data.y === 'number' ? data.y : 0;
        const z = typeof data.z === 'number' ? data.z : 0;
        const atkCoords = this.resolveAttackerCoords(killerId, x, z);
        const res = this.world.wildlife.applyAuthoritativeDamage(
          targetId,
          0,
          100,
          true,
          false,
          atkCoords.x,
          atkCoords.z,
        );
        if (res.justKilled) {
          this.spawnDustBurst(x, y, z, 5);
          if (killerId === this.localMultiplayerPlayerId) {
            this.sound.playEnemyDefeat();
            if (res.species) {
              this.recordEnemyKill(`animal:${res.species}`);
            }
            this.awardXpAndCoins(12, 0);
          }
          if (this.isLocalMultiplayerHost() && res.drops && res.drops.length > 0) {
            for (let i = 0; i < res.drops.length; i++) {
              const d = res.drops[i];
              const angle = (i * Math.PI * 2) / Math.max(1, res.drops.length) + 0.4;
              const offset = res.drops.length > 1 ? 0.65 : 0;
              const label = this.itemManager.getItem(d.itemId)?.name ?? d.itemId;
              const dropId = `drop_animal_${targetId}_${i}_${Date.now().toString(36)}`;
              const spawned = this.world.spawnWorldPickup(
                x + Math.cos(angle) * offset,
                z + Math.sin(angle) * offset,
                d.itemId,
                d.quantity,
                label,
                dropId,
                true,
              );
              this.multiplayerService?.sendGameEvent('ITEM_DROPPED', {
                dropId: spawned.id,
                itemId: d.itemId,
                count: d.quantity,
                label,
                x: Math.round(spawned.x * 100) / 100,
                y: Math.round(spawned.y * 100) / 100,
                z: Math.round(spawned.z * 100) / 100,
              });
            }
          }
          this.emitHud();
        }
        break;
      }

      case 'NPC_DAMAGED': {
        const targetId = typeof data.targetId === 'string' ? data.targetId : '';
        if (!targetId) return;
        const attackerId =
          typeof data.attackerId === 'string' ? data.attackerId : senderPlayerId;
        const hp = typeof data.hp === 'number' ? data.hp : 0;
        const maxHp = typeof data.maxHp === 'number' ? data.maxHp : 100;
        const isCrit = Boolean(data.isCrit);
        const x = typeof data.x === 'number' ? data.x : 0;
        const y = typeof data.y === 'number' ? data.y : 1;
        const z = typeof data.z === 'number' ? data.z : 0;
        const atkCoords = this.resolveAttackerCoords(attackerId, x, z);
        this.world.npcs.applyAuthoritativeDamage(
          targetId,
          hp,
          maxHp,
          false,
          atkCoords.x,
          atkCoords.z,
        );
        this.combat.spawnHitSparks(x, y, z, isCrit ? 6 : 4);
        if (attackerId === this.localMultiplayerPlayerId) {
          this.sound.playHitImpact(isCrit);
          this.callbacks.onWorldNotice(t.bowNpcWarningNotice);
        }
        break;
      }

      case 'NPC_DIED': {
        const targetId = typeof data.targetId === 'string' ? data.targetId : '';
        if (!targetId) return;
        const killerId =
          typeof data.killerId === 'string' ? data.killerId : senderPlayerId;
        const x = typeof data.x === 'number' ? data.x : 0;
        const y = typeof data.y === 'number' ? data.y : 0;
        const z = typeof data.z === 'number' ? data.z : 0;
        const atkCoords = this.resolveAttackerCoords(killerId, x, z);
        const res = this.world.npcs.applyAuthoritativeDamage(
          targetId,
          0,
          100,
          true,
          atkCoords.x,
          atkCoords.z,
        );
        if (res?.justKilled) {
          this.spawnDustBurst(x, y, z, 6);
          this.emitHud();
        }
        break;
      }

      case 'PLAYER_DIED': {
        const playerId = typeof data.playerId === 'string' ? data.playerId : '';
        if (
          playerId !== this.localMultiplayerPlayerId &&
          typeof data.x === 'number' &&
          typeof data.z === 'number'
        ) {
          this.spawnDustBurst(
            data.x,
            typeof data.y === 'number' ? data.y : 0.8,
            data.z,
            6,
          );
        }
        break;
      }

      case 'CHEST_OPENED': {
        const openedBy = typeof data.openedBy === 'string' ? data.openedBy : senderPlayerId;
        if (openedBy === this.localMultiplayerPlayerId) return;
        const chestId = typeof data.chestId === 'string' ? data.chestId : '';
        if (!chestId) return;
        const chest = this.world.markChestOpenedRemote(chestId);
        if (chest) {
          this.spawnDustBurst(chest.x, chest.y + 0.6, chest.z, 6);
        }
        break;
      }

      case 'PLAYER_COLLECTED_RESOURCE': {
        const collectedBy =
          typeof data.collectedBy === 'string' ? data.collectedBy : senderPlayerId;
        if (collectedBy === this.localMultiplayerPlayerId) return;
        const nodeId = typeof data.nodeId === 'string' ? data.nodeId : '';
        if (!nodeId) return;
        const usesRemaining =
          typeof data.usesRemaining === 'number' ? data.usesRemaining : 0;
        const depleted = Boolean(data.depleted);
        this.world.applyResourceNodeState(
          nodeId,
          usesRemaining,
          depleted,
          this.elapsed + 90,
        );
        if (typeof data.x === 'number' && typeof data.z === 'number') {
          this.spawnDustBurst(
            data.x,
            (typeof data.y === 'number' ? data.y : 0) + 0.5,
            data.z,
            4,
          );
        }
        break;
      }

      case 'ITEM_DROPPED': {
        const dropId = typeof data.dropId === 'string' ? data.dropId : '';
        const itemId = typeof data.itemId === 'string' ? data.itemId : '';
        if (!dropId || !itemId) return;
        if (this.world.interactables.some((it) => it.id === dropId)) return;
        const count = typeof data.count === 'number' ? Math.max(1, Math.round(data.count)) : 1;
        const label = typeof data.label === 'string' ? data.label : itemId;
        const x = typeof data.x === 'number' ? data.x : 0;
        const z = typeof data.z === 'number' ? data.z : 0;
        this.world.spawnWorldPickup(x, z, itemId, count, label, dropId, true);
        break;
      }

      case 'ITEM_PICKED_UP': {
        const pickedUpBy =
          typeof data.pickedUpBy === 'string' ? data.pickedUpBy : senderPlayerId;
        if (pickedUpBy === this.localMultiplayerPlayerId) return;
        const pickupId = typeof data.pickupId === 'string' ? data.pickupId : '';
        if (!pickupId) return;
        if (data.isPlayerDrop) {
          this.world.removePickupById(pickupId);
        } else {
          this.world.markPickupCollectedRemote(pickupId);
        }
        break;
      }

      case 'DOOR_OPENED':
      case 'DOOR_CLOSED': {
        const doorPlayerId =
          typeof data.playerId === 'string' ? data.playerId : senderPlayerId;
        if (doorPlayerId === this.localMultiplayerPlayerId) return;
        const doorId = typeof data.doorId === 'string' ? data.doorId : '';
        if (!doorId) return;
        this.world.setDoorOpen(doorId, payload.event === 'DOOR_OPENED');
        break;
      }

      case 'BED_PLACED': {
        const ownerId = typeof data.ownerId === 'string' ? data.ownerId : senderPlayerId;
        if (ownerId === this.localMultiplayerPlayerId) return;
        const bedId = typeof data.bedId === 'string' ? data.bedId : '';
        if (!bedId || this.world.interactables.some((it) => it.id === bedId)) return;
        const x = typeof data.x === 'number' ? data.x : 0;
        const z = typeof data.z === 'number' ? data.z : 0;
        const yaw = typeof data.yaw === 'number' ? data.yaw : 0;
        this.world.placeBedAt(x, z, yaw, bedId);
        break;
      }

      case 'BED_USED': {
        const usedBy = typeof data.usedBy === 'string' ? data.usedBy : senderPlayerId;
        if (usedBy === this.localMultiplayerPlayerId) return;
        const newHours =
          typeof data.newWorldHours === 'number' ? data.newWorldHours : 6.5;
        this.timeManager.setWorldHours(newHours);
        this.world.npcs.wakeAllSleepingNpcs();
        this.syncWorldTimeImmediate();
        this.emitHud();
        break;
      }

      case 'QUEST_UPDATED': {
        const updatedBy =
          typeof data.updatedBy === 'string' ? data.updatedBy : senderPlayerId;
        if (updatedBy === this.localMultiplayerPlayerId) return;
        const questId = typeof data.questId === 'string' ? data.questId : '';
        const status = typeof data.status === 'string' ? data.status : 'active';
        const stepIndex = typeof data.stepIndex === 'number' ? data.stepIndex : 0;
        if (!questId) return;
        this.dialogueEngine.quests.applyRemoteQuestUpdate(
          questId,
          status,
          stepIndex,
          this.dialogueBridge,
        );
        this.emitHud();
        break;
      }

      case 'WORLD_EVENT': {
        const emittedBy =
          typeof data.emittedBy === 'string' ? data.emittedBy : senderPlayerId;
        if (emittedBy === this.localMultiplayerPlayerId) return;
        const kind = typeof data.kind === 'string' ? data.kind : '';
        if (kind === 'landmark_discovered' && typeof data.landmarkId === 'string') {
          this.isApplyingRemoteWorldEvent = true;
          try {
            const lm = this.landmarks.find((l) => l.id === data.landmarkId);
            if (lm && !lm.discovered) {
              lm.discovered = true;
              this.mapManager.revealAround(lm.x, lm.z, 110);
              this.emitHud();
            }
          } finally {
            this.isApplyingRemoteWorldEvent = false;
          }
        } else if (
          kind === 'weather_changed' &&
          typeof data.weather === 'string' &&
          this.isValidWeatherState(data.weather)
        ) {
          this.isApplyingRemoteTimeWeather = true;
          try {
            this.lastSyncedWeatherState = data.weather;
            this.weatherManager.setWeather(data.weather, false);
            this.syncWorldTimeImmediate();
            this.emitHud();
          } finally {
            this.isApplyingRemoteTimeWeather = false;
          }
        }
        break;
      }
    }
  }

  private applyLoadedSave(data: SaveGameData): void {
    this.multiplayerSessionActive = false;
    this.authoritativeMultiplayerConfig = null;
    this.teardownMultiplayerSync();
    this.endNpcDialogue();
    this.rebuildWorldForSeed(data.world.worldSeed);

    this.playTimeSeconds = data.meta.playTimeSeconds;
    this.activeSaveSlot = data.meta.slotId;
    this.activeWorldName = data.meta.worldName || 'Oakhollow Valley';
    this.activeWorldType = data.meta.worldType ?? data.world.worldType ?? 'normal';
    this.activeDifficulty = data.meta.difficulty ?? data.world.difficulty ?? 'normal';
    this.activeWorldCreatedAtMs = data.meta.createdAtMs || data.meta.savedAtMs;
    this.autosaveTimer = 0;
    this.hasUnsavedProgress = false;
    this.unsavedTimer = 0;

    this.controller.setGameplayModifiers(this.activeDifficulty, this.activeWorldType);

    this.isSleeping = false;
    this.sleepTimer = 0;

    // 1. Restore inventory & equipped bonuses before clamping player vitals
    this.inventoryManager.restoreState(data.inventory);
    this.syncEquipmentBonuses();
    this.syncEquippedWeaponFromInventory();

    // 2. Restore player progression, position (relocated off water if legacy save), health & stamina
    this.playerLevel = Math.max(1, data.player.level);
    this.playerXp = Math.max(0, data.player.xp);
    this.playerCoins = Math.max(0, data.player.coins);

    let px = Number.isFinite(data.player.position.x) ? data.player.position.x : 0;
    let pz = Number.isFinite(data.player.position.z) ? data.player.position.z : 4;
    let py = Number.isFinite(data.player.position.y)
      ? data.player.position.y
      : groundHeightAt(px, pz);
    if (!isLand(px, pz, 0.45) || isWater(px, pz)) {
      const safeLand = findNearestValidLand(px, pz, 4, 0.32, 220);
      px = safeLand.x;
      pz = safeLand.z;
      py = safeLand.y;
    }

    this.controller.setPoseAndVitals({
      x: px,
      y: py,
      z: pz,
      yaw: data.player.rotation.yaw,
      cameraYaw: data.player.rotation.cameraYaw,
      cameraPitch: data.player.rotation.cameraPitch,
      health: data.player.health,
      stamina: data.player.stamina,
    });

    // 3. Restore quest progress, completed quests & dialogue flags
    this.dialogueEngine.quests.restoreState(data.quests);
    this.dialogueEngine.restoreFlags(data.world.dialogueFlags);

    // 4. Restore time & weather
    this.timeManager.restoreState(data.time);
    this.weatherManager.restoreState(data.weather);

    // 4b. Restore camera perspective & footstep audio preference if saved
    if (data.camera) {
      this.cameraSettings = { ...data.camera };
      this.settings.mouseSensitivity = data.camera.sensitivity;
      this.settings.invertY = data.camera.invertY;
      this.cameraRig?.updateCameraConfig({
        distance: data.camera.distance,
        shoulderHeight: data.camera.height,
        smoothingScale: data.camera.smoothing,
      });
      this.cameraRig?.setPerspective(data.camera.perspective, true);
    }
    if (typeof data.audio?.footstepVolume === 'number') {
      this.footstepVolume = data.audio.footstepVolume;
      this.sound.setAudioVolumes({ footstepVolume: this.footstepVolume });
    }
    this.player?.setFirstPersonMode(
      this.cameraRig?.isFirstPersonActive() ?? false,
      this.cameraRig?.getPitch() ?? 0,
    );
    this.updateInteractionIndicatorScreenPos();

    // 5. Restore important world state & defeated enemies / killed wildlife
    this.world.restoreImportantState({
      discoveredLandmarkIds: data.world.discoveredLandmarkIds,
      collectedInteractableIds: data.world.collectedInteractableIds,
      droppedPickups: data.world.droppedPickups,
      placedBeds: data.world.placedBeds ?? [],
      depletedNodes: data.world.depletedNodes ?? [],
      openedChestIds: data.world.openedChestIds ?? [],
    });
    this.waypoint = data.world.waypoint ? { ...data.world.waypoint } : null;
    this.mapManager.restoreFogState(
      data.world.fogOfWar,
      this.landmarks,
      px,
      pz,
    );
    this.lastFogRevealX = px;
    this.lastFogRevealZ = pz;

    this.world.wildlife.restoreKilledAnimalIds(data.world.killedAnimalIds ?? []);
    this.combat.resetPlayerAndAggro();
    this.combat.restoreDefeatedEnemies(data.world.defeatedEnemyIds);

    this.syncWorldTimeImmediate();
    this.skyRig.updateSunFollow(this.controller.position);
    this.world.update(
      0,
      this.controller.position,
      this.camera,
      0,
      this.timeManager.getWorldHours(),
    );

    this.emitInventorySnapshot();
    this.emitHud();
  }

  public loadFromSlot(slotId: SaveSlotId): boolean {
    if (!this.controller || !this.world || this.multiplayerSessionActive) return false;
    const res = this.loadManager.loadSlot(slotId);
    if (!res.ok) {
      this.callbacks.onWorldNotice(UI_TEXT[this.language].loadFailedNotice);
      return false;
    }

    this.sound.unlock();
    this.sound.playUiClick();
    this.applyLoadedSave(res.data);
    this.saveManager.setLastActiveSlot(slotId);

    this.input?.setTouchMode(this.touchModeEnabled);
    this.setPhase('playing');
    if (!this.touchModeEnabled && !this.modalOpen) {
      this.input?.requestPointerLock();
    }
    this.callbacks.onWorldNotice(
      UI_TEXT[this.language].loadedNotice(res.data.meta.worldName || this.getSlotDisplayName(slotId)),
    );
    return true;
  }

  public continueLatestSave(): boolean {
    const latest = this.getMostRecentSaveMeta();
    if (!latest) return false;
    return this.loadFromSlot(latest.slotId);
  }

  public createNewWorld(options: NewWorldOptions): boolean {
    if (!this.controller || !this.world) return false;
    this.multiplayerSessionActive = false;
    this.authoritativeMultiplayerConfig = null;
    this.teardownMultiplayerSync();
    const worldId = generateWorldId();
    const cleanName = options.worldName.trim() || 'Oakhollow Valley';
    const seed = Number.isFinite(options.seed)
      ? Math.floor(Math.abs(options.seed)) || DEFAULT_WORLD_SEED
      : DEFAULT_WORLD_SEED;

    this.sound.unlock();
    this.sound.playUiClick();
    this.endNpcDialogue();

    this.rebuildWorldForSeed(seed);
    this.playTimeSeconds = 0;
    this.autosaveTimer = 0;
    this.playerLevel = 1;
    this.playerXp = 0;
    this.playerCoins = options.worldType === 'creative' ? 500 : options.worldType === 'adventure' ? 50 : 0;
    this.activeSaveSlot = worldId;
    this.activeWorldName = cleanName;
    this.activeWorldType = options.worldType;
    this.activeDifficulty = options.difficulty;
    this.activeWorldCreatedAtMs = Date.now();
    this.hasUnsavedProgress = false;
    this.unsavedTimer = 0;

    this.controller.setGameplayModifiers(options.difficulty, options.worldType);

    this.dialogueEngine.quests.reset();
    this.dialogueEngine.restoreFlags([]);
    this.aiService.resetAllMemory();
    this.seedStarterInventory();
    this.syncEquipmentBonuses();
    this.syncEquippedWeaponFromInventory();

    this.isSleeping = false;
    this.sleepTimer = 0;

    this.world.restoreImportantState({
      discoveredLandmarkIds: ['spawn-glade'],
      collectedInteractableIds: [],
      droppedPickups: [],
      placedBeds: [],
      depletedNodes: [],
      openedChestIds: [],
    });
    this.world.wildlife.restoreKilledAnimalIds([]);

    this.timeManager.restoreState({
      worldHours: 8.5,
      dayCount: 1,
      fullDayDurationSeconds: 360,
      timeScale: 1,
      paused: false,
    });
    this.weatherManager.setWeather('clear', true);
    this.weatherManager.setDynamicEnabled(true);

    this.controller.reset(0, 4);
    this.waypoint = null;
    this.mapManager.resetFog();
    this.mapManager.revealAround(0, 4, 195);
    this.lastFogRevealX = 0;
    this.lastFogRevealZ = 4;
    this.statAccumTimeSec = 0;
    this.statAccumDistM = 0;
    this.lastStatTrackX = 0;
    this.lastStatTrackZ = 4;
    ProfileManager.recordGameplayDelta({ worldsCreated: 1 });

    this.combat.dispose();
    this.combat = this.createCombatManager(this.world.seed);
    this.wireWorldAndCombatLinks();
    this.syncWorldTimeImmediate();
    this.skyRig.updateSunFollow(this.controller.position);
    this.world.update(
      this.elapsed,
      this.controller.position,
      this.camera,
      0,
      this.timeManager.getWorldHours(),
    );

    // Save initial world state immediately so it appears in Load World & Continue
    this.saveManager.saveToSlot(worldId, this.captureSaveSource(true));

    this.emitInventorySnapshot();
    this.emitHud();

    this.input?.setTouchMode(this.touchModeEnabled);
    this.setPhase('playing');
    if (!this.touchModeEnabled) {
      this.input?.requestPointerLock();
    }
    return true;
  }

  public startMultiplayerWorld(options: {
    worldName: string;
    seed: number;
    worldType: WorldType;
    difficulty: DifficultyLevel;
    localPlayerId?: string;
    players?: MultiplayerPlayer[];
  }): boolean {
    if (!this.controller || !this.world) return false;
    this.multiplayerSessionActive = true;
    const cleanName = options.worldName.trim() || 'Oakhollow Co-op';
    const seed = Number.isFinite(options.seed)
      ? Math.floor(Math.abs(options.seed)) || DEFAULT_WORLD_SEED
      : DEFAULT_WORLD_SEED;
    this.authoritativeMultiplayerConfig = {
      seed,
      worldType: options.worldType,
      difficulty: options.difficulty,
    };

    this.sound.unlock();
    this.sound.playUiClick();
    this.endNpcDialogue();

    this.rebuildWorldForSeed(seed);
    this.playTimeSeconds = 0;
    this.autosaveTimer = 0;
    this.playerLevel = 1;
    this.playerXp = 0;
    this.playerCoins =
      options.worldType === 'creative' ? 500 : options.worldType === 'adventure' ? 50 : 0;
    this.activeWorldName = cleanName;
    this.activeWorldType = options.worldType;
    this.activeDifficulty = options.difficulty;
    this.activeWorldCreatedAtMs = Date.now();
    this.hasUnsavedProgress = false;
    this.unsavedTimer = 0;
    this.statAccumTimeSec = 0;
    this.statAccumDistM = 0;
    this.lastStatTrackX = null;
    this.lastStatTrackZ = null;

    this.controller.setGameplayModifiers(options.difficulty, options.worldType);

    this.dialogueEngine.quests.reset();
    this.dialogueEngine.restoreFlags([]);
    this.aiService.resetAllMemory();
    this.seedStarterInventory();
    this.syncEquipmentBonuses();
    this.syncEquippedWeaponFromInventory();

    this.isSleeping = false;
    this.sleepTimer = 0;

    this.world.restoreImportantState({
      discoveredLandmarkIds: ['spawn-glade'],
      collectedInteractableIds: [],
      droppedPickups: [],
      placedBeds: [],
      depletedNodes: [],
      openedChestIds: [],
    });
    this.world.wildlife.restoreKilledAnimalIds([]);

    this.timeManager.restoreState({
      worldHours: 8.5,
      dayCount: 1,
      fullDayDurationSeconds: 360,
      timeScale: 1,
      paused: false,
    });
    this.weatherManager.setWeather('clear', true);
    this.weatherManager.setDynamicEnabled(true);

    this.controller.reset(0, 4);
    this.waypoint = null;
    this.mapManager.resetFog();
    this.mapManager.revealAround(0, 4, 195);
    this.lastFogRevealX = 0;
    this.lastFogRevealZ = 4;

    this.combat.dispose();
    this.combat = this.createCombatManager(this.world.seed);
    this.wireWorldAndCombatLinks();
    this.syncEquippedWeaponFromInventory();
    this.syncWorldTimeImmediate();
    this.skyRig.updateSunFollow(this.controller.position);
    this.world.update(
      this.elapsed,
      this.controller.position,
      this.camera,
      0,
      this.timeManager.getWorldHours(),
    );

    const localId =
      options.localPlayerId ?? this.multiplayerService?.getLocalPlayerId() ?? null;
    const roster =
      options.players ?? this.multiplayerService?.getRoomState()?.players ?? [];
    this.setupMultiplayerSync(roster, localId);
    this.syncLocalMultiplayerState(0.05, true);

    this.emitInventorySnapshot();
    this.emitHud();

    this.input?.setTouchMode(this.touchModeEnabled);
    this.setPhase('playing');
    if (!this.touchModeEnabled) {
      this.input?.requestPointerLock();
    }
    return true;
  }

  public startNewGame(seed = DEFAULT_WORLD_SEED): void {
    this.createNewWorld({
      worldName: 'Oakhollow Valley',
      seed,
      worldType: 'normal',
      difficulty: 'normal',
    });
  }

  public returnToMainMenu(): void {
    this.multiplayerSessionActive = false;
    this.authoritativeMultiplayerConfig = null;
    this.teardownMultiplayerSync();
    this.endNpcDialogue();
    this.modalOpen = false;
    this.input?.exitPointerLock();
    this.input?.clearAll();
    this.sound.updateWeatherAudio(0, 0, false, this.elapsed);
    this.setPhase('title');
  }

  public deleteSaveSlot(slotId: SaveSlotId): boolean {
    const existing = this.loadManager.loadSlot(slotId);
    const label = existing.ok ? existing.data.meta.worldName : this.getSlotDisplayName(slotId);
    const ok = this.saveManager.deleteSave(slotId);
    if (ok) {
      this.sound.playUiClick();
      this.callbacks.onWorldNotice(UI_TEXT[this.language].deletedNotice(label));
    }
    return ok;
  }

  public resetPlayerPosition(): void {
    this.controller.reset(0, 4);
    this.mapManager.revealAround(0, 4, 195);
    this.lastFogRevealX = 0;
    this.lastFogRevealZ = 4;
    this.syncWorldTimeImmediate();
    this.skyRig.updateSunFollow(this.controller.position);
    this.world.update(
      this.elapsed,
      this.controller.position,
      this.camera,
      0,
      this.timeManager.getWorldHours(),
    );
    this.emitHud();
  }

  private syncWorldTimeImmediate(): void {
    const hours = this.timeManager.getWorldHours();
    const weatherSnap = this.weatherManager.getSnapshot();
    if (this.world && this.controller) {
      this.world.npcs.setWorldHours(hours);
      this.world.village.update(this.elapsed, this.controller.position, hours);
    }
    if (this.skyRig) {
      this.skyRig.updateTimeOfDay(hours, this.elapsed, weatherSnap);
    }
    if (this.weatherEffects && this.controller) {
      this.weatherEffects.update(
        this.elapsed,
        this.controller.position,
        weatherSnap,
        this.timeManager.getNightFactor(),
      );
      this.atmosphericParticles?.update(
        this.elapsed,
        this.controller.position,
        weatherSnap,
        this.timeManager.getNightFactor(),
      );
    }
  }

  public getTimeSnapshot(): TimeSnapshot {
    return this.timeManager.getSnapshot();
  }

  public setTimeHours(hours: number): void {
    this.timeManager.setWorldHours(hours);
    this.syncWorldTimeImmediate();
    this.emitHud();
  }

  public jumpToTimePreset(preset: TimePreset): void {
    this.sound.playUiClick();
    this.timeManager.jumpToPreset(preset);
    this.syncWorldTimeImmediate();
    this.emitHud();
  }

  public setFullDayDurationSeconds(seconds: number): void {
    this.timeManager.setFullDayDurationSeconds(seconds);
    this.emitHud();
  }

  public setTimeScale(scale: number): void {
    this.sound.playUiClick();
    this.timeManager.setTimeScale(scale);
    this.emitHud();
  }

  public setTimePaused(paused: boolean): void {
    this.sound.playUiClick();
    this.timeManager.setPaused(paused);
    this.emitHud();
  }

  public getWeatherSnapshot(): WeatherSnapshot {
    return this.weatherManager.getSnapshot();
  }

  public setWeatherState(state: WeatherState, immediate = false): void {
    this.sound.playUiClick();
    this.weatherManager.setWeather(state, immediate);
    if (
      this.multiplayerSessionActive &&
      this.multiplayerService &&
      !this.isApplyingRemoteTimeWeather &&
      this.isLocalMultiplayerHost()
    ) {
      this.lastSyncedWeatherState = state;
      this.multiplayerService.sendGameEvent('WORLD_EVENT', {
        kind: 'weather_changed',
        weather: state,
      });
    }
    this.syncWorldTimeImmediate();
    this.emitHud();
  }

  public setWeatherDynamic(enabled: boolean): void {
    this.sound.playUiClick();
    this.weatherManager.setDynamicEnabled(enabled);
    this.emitHud();
  }

  public setWeatherTransitionDuration(seconds: number): void {
    this.weatherManager.setTransitionDurationSeconds(seconds);
    this.emitHud();
  }

  public setWeatherQuality(quality: WeatherQuality): void {
    this.sound.playUiClick();
    this.weatherManager.setQuality(quality);
    this.syncWorldTimeImmediate();
    this.emitHud();
  }

  public triggerLightningStrike(): void {
    this.sound.unlock();
    this.weatherManager.triggerLightningStrike();
    this.syncWorldTimeImmediate();
    this.emitHud();
  }

  public getCameraPerspective(): CameraPerspective {
    return this.cameraRig?.getPerspective() ?? this.cameraSettings.perspective;
  }

  public setCameraPerspective(
    mode: CameraPerspective,
    immediate = false,
  ): void {
    this.cameraSettings = { ...this.cameraSettings, perspective: mode };
    this.cameraRig?.setPerspective(mode, immediate);
    const ext = loadExtendedSettings();
    ext.camera.perspective = mode;
    saveExtendedSettings(ext);
    this.player?.setFirstPersonMode(
      this.cameraRig?.isFirstPersonActive() ?? false,
      this.cameraRig?.getPitch() ?? 0,
    );
    this.updateInteractionIndicatorScreenPos();
    this.emitHud();
  }

  public cycleCameraPerspective(): CameraPerspective {
    const next = this.cameraRig
      ? this.cameraRig.cyclePerspective()
      : 'third-person';
    this.sound.playUiClick();
    this.cameraSettings = { ...this.cameraSettings, perspective: next };
    const ext = loadExtendedSettings();
    ext.camera.perspective = next;
    saveExtendedSettings(ext);
    this.player?.setFirstPersonMode(
      this.cameraRig?.isFirstPersonActive() ?? false,
      this.cameraRig?.getPitch() ?? 0,
    );
    this.updateInteractionIndicatorScreenPos();
    this.callbacks.onWorldNotice(
      UI_TEXT[this.language].cameraPerspectiveNotice(next),
    );
    this.emitHud();
    return next;
  }

  public updateSettings(partial: Partial<GameSettings>): void {
    this.settings = { ...this.settings, ...partial };
    if (partial.muted !== undefined) {
      this.sound.setMuted(partial.muted);
    }
  }

  public applyExtendedSettings(ext: ExtendedGameSettings): void {
    this.footstepVolume = ext.audio.footstepVolume;
    this.sound.setAudioVolumes({
      masterVolume: ext.audio.masterVolume,
      musicVolume: ext.audio.musicVolume,
      effectsVolume: ext.audio.effectsVolume,
      voiceVolume: ext.audio.voiceVolume,
      footstepVolume: ext.audio.footstepVolume,
      muted: ext.audio.muted,
    });
    this.reducedMotionEnabled = ext.accessibility.reducedMotion;
    this.vsyncEnabled = ext.vsync;
    this.cameraRig?.setBaseFov(ext.gameplay.fov);
    this.cameraRig?.setReducedMotion(ext.accessibility.reducedMotion);
    this.weatherManager.setMaxStateDurationSeconds(
      ext.gameplay.weatherMaxDurationSeconds,
    );

    if (ext.camera) {
      this.cameraSettings = { ...ext.camera };
      this.settings.mouseSensitivity = ext.camera.sensitivity;
      this.settings.invertY = ext.camera.invertY;
      this.cameraRig?.updateCameraConfig({
        distance: ext.camera.distance,
        shoulderHeight: ext.camera.height,
        smoothingScale: ext.camera.smoothing,
      });
      this.cameraRig?.setPerspective(ext.camera.perspective, false);
      this.player?.setFirstPersonMode(
        this.cameraRig?.isFirstPersonActive() ?? false,
        this.cameraRig?.getPitch() ?? 0,
      );
      this.updateInteractionIndicatorScreenPos();
    }

    this.activeDifficulty = ext.gameplay.difficulty;
    this.showBowTrajectory = ext.gameplay.showBowTrajectory;
    if (!this.showBowTrajectory) {
      this.combat?.hideBowTrajectoryPreview();
    }
    this.controller?.setGameplayModifiers(
      this.activeDifficulty,
      this.activeWorldType,
    );
    this.graphicsManager?.setDynamicQualityEnabled(ext.dynamicQuality);
    this.setWorldGenDebugEnabled(
      import.meta.env.DEV ? Boolean(ext.gameplay.showWorldGenDebug) : false,
    );
    this.biomeDebugEnabled = Boolean(ext.gameplay.showBiomeDebug);
    this.showPlayerNamesSetting = Boolean(ext.gameplay.showPlayerNames);
    this.remotePlayersManager?.setShowPlayerNames(this.showPlayerNamesSetting);
    this.world?.setBiomeDebugEnabled(this.biomeDebugEnabled);
    this.emitHud();
  }

  private setWorldGenDebugEnabled(enabled: boolean): void {
    const effective = import.meta.env.DEV && enabled;
    this.worldGenDebugEnabled = effective;
    if (!effective) {
      this.worldGenDebugRenderer?.setVisible(false);
      return;
    }
    this.refreshWorldGenDebugRenderer();
  }

  private refreshWorldGenDebugRenderer(): void {
    if (!import.meta.env.DEV || !this.scene || !this.world) return;
    if (!this.worldGenDebugRenderer) {
      this.worldGenDebugRenderer = new WorldGenDebugRenderer(this.scene);
    }
    this.worldGenDebugRenderer.rebuild(
      this.world.village.villages,
      this.world.interactables,
      getWorldGenTelemetry(),
    );
    this.worldGenDebugRenderer.setVisible(this.worldGenDebugEnabled);
  }

  public updateMobileSettings(next: MobileControlSettings): void {
    this.mobileSettings = next;
    this.cameraRig?.updatePortraitConfig(next.portraitCamera);
  }

  public advanceDialogue(): void {
    this.sound.playUiClick();
    const nextSnapshot = this.dialogueEngine.next();
    if (!nextSnapshot) {
      this.world?.npcs.endDialogue();
    }
    this.callbacks.onDialogueChange(nextSnapshot);
    this.emitHud();
  }

  public selectDialogueChoice(choiceId: string): void {
    this.sound.playUiClick();
    const nextSnapshot = this.dialogueEngine.selectChoice(choiceId);
    if (!nextSnapshot) {
      this.world?.npcs.endDialogue();
    }
    this.callbacks.onDialogueChange(nextSnapshot);
    this.emitHud();
  }

  public endNpcDialogue(): void {
    this.dialogueEngine.close();
    this.world?.npcs.endDialogue();
    this.callbacks.onDialogueChange(null);
    this.emitHud();
  }

  public getAiWorldContext(): AIWorldContext {
    const pos = this.controller?.position;
    const biome = pos ? getBiomeAt(pos.x, pos.z) : 'Plains';
    const timeSnap = this.timeManager.getSnapshot();
    const weatherSnap = this.weatherManager.getSnapshot();
    const activeQuests = this.dialogueEngine.quests
      .getActiveQuests(this.dialogueBridge)
      .map((q) => q.title);
    const completedQuests = this.dialogueEngine.quests
      .getCompletedQuests(this.dialogueBridge)
      .map((q) => q.title);

    return {
      biome,
      timeOfDay: `${timeSnap.formattedTime} (Day ${timeSnap.dayCount})`,
      weather: weatherSnap.currentState,
      playerLevel: this.playerLevel,
      activeQuests,
      completedQuests,
    };
  }

  public setTrackedQuest(questId: string | null): void {
    this.dialogueEngine.quests.setTrackedQuest(questId);
    this.emitHud();
  }

  public recordEnemyKill(enemyType: string): void {
    const changed = this.dialogueEngine.quests.onEnemyKilled(
      enemyType,
      this.dialogueBridge,
      (msg) => this.callbacks.onWorldNotice(msg),
    );
    if (changed) {
      this.emitHud();
    }
  }

  public getQuestJournalData(): {
    active: QuestView[];
    completed: QuestView[];
    available: QuestView[];
  } {
    return {
      active: this.dialogueEngine.quests.getActiveQuests(this.dialogueBridge),
      completed: this.dialogueEngine.quests.getCompletedQuests(this.dialogueBridge),
      available: this.dialogueEngine.quests.getAvailableQuests(this.dialogueBridge),
    };
  }

  public getJournalQuests(): QuestView[] {
    return [
      ...this.dialogueEngine.quests.getActiveQuests(this.dialogueBridge),
      ...this.dialogueEngine.quests.getCompletedQuests(this.dialogueBridge),
    ];
  }

  private setPhase(next: GamePhase): void {
    this.phase = next;
    if (next !== 'playing') {
      this.cancelActiveBowCharge(false);
    }
    this.input?.setActive(next === 'playing' && !this.modalOpen);
    this.callbacks.onPhaseChange(next);
  }

  private tick = (now = performance.now()): void => {
    if (this.disposed) return;

    const rawFpsLimit = this.graphicsManager?.getProfile().fpsLimit ?? 0;
    const fpsLimit = rawFpsLimit > 0 ? rawFpsLimit : this.vsyncEnabled ? 60 : 0;
    if (!this.isSoftwareGl && fpsLimit > 0 && this.lastRenderTimeMs > 0) {
      const minInterval = 1000 / fpsLimit;
      if (now - this.lastRenderTimeMs < minInterval - 0.8) {
        this.frameId = requestAnimationFrame(this.tick);
        return;
      }
    }
    this.lastRenderTimeMs = now;
    this.performanceMonitor.recordFrame(now);

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);

    if (this.phase !== 'paused') {
      this.elapsed += dt;
      this.updateDust(dt);
    }

    let weatherSnap = this.weatherManager.getSnapshot();

    if (this.phase === 'title') {
      this.cameraRig.updateTitleOrbit(dt, this.controller.position);
      this.skyRig.updateTimeOfDay(
        this.timeManager.getWorldHours(),
        this.elapsed,
        weatherSnap,
      );
      this.skyRig.updateSunFollow(this.controller.position);
      this.weatherEffects.update(
        this.elapsed,
        this.controller.position,
        weatherSnap,
        this.timeManager.getNightFactor(),
      );
      this.atmosphericParticles.update(
        this.reducedMotionEnabled ? this.elapsed * 0.25 : this.elapsed,
        this.controller.position,
        weatherSnap,
        this.timeManager.getNightFactor(),
      );
      this.sound.updateWeatherAudio(0, 0, false, this.elapsed);
      const groundY = groundHeightAt(
        this.controller.position.x,
        this.controller.position.z,
      );
      this.player.updateAnimation(dt, 0, true, 0, 'idle', groundY);
    } else if (this.phase === 'playing') {
      if (this.isSleeping) {
        this.sleepTimer += dt;
        this.controller.updateIdleOnly(dt);
        this.sound.updateWeatherAudio(0, 0, false, this.elapsed);
        if (this.sleepTimer >= this.SLEEP_DURATION_SEC) {
          this.completeSleepTransition();
        } else {
          this.emitHud();
        }
      } else if (!this.modalOpen) {
        this.updateGameplay(dt);
        weatherSnap = this.weatherManager.getSnapshot();
      } else {
        this.controller.updateIdleOnly(dt);
        this.sound.updateWeatherAudio(0, 0, false, this.elapsed);
      }
      if (this.multiplayerSessionActive) {
        this.remotePlayersManager?.update(dt, Date.now(), this.controller.position);
      }
    } else {
      this.sound.updateWeatherAudio(0, 0, false, this.elapsed);
    }

    this.world.update(
      this.elapsed,
      this.controller.position,
      this.camera,
      this.phase === 'paused' ? 0 : dt,
      this.timeManager.getWorldHours(),
      weatherSnap.atmosphere.windStrength,
      weatherSnap.windAngleRad,
      this.skyRig,
    );
    if (this.postProcessing && !this.isSoftwareGl) {
      this.postProcessing.update(
        this.timeManager.getNightFactor(),
        weatherSnap.lightningFlash,
      );
      this.postProcessing.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    if (this.debugOverlayEnabled) {
      this.objectCountTimer += dt;
      if (this.objectCountTimer >= 1.0) {
        this.objectCountTimer = 0;
        let objCount = 0;
        this.scene.traverseVisible(() => {
          objCount++;
        });
        this.cachedActiveObjects = objCount;
      }
      this.debugEmitTimer += dt;
      if (this.debugEmitTimer >= 0.25) {
        this.debugEmitTimer = 0;
        this.callbacks.onDebugPerfUpdate?.(this.getDebugPerformanceSnapshot());
      }
    }

    this.scheduleNextFrame();
  };

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateGameplay(dt: number): void {
    this.playTimeSeconds += dt;
    this.unsavedTimer += dt;
    if (this.unsavedTimer >= 2.0) {
      this.hasUnsavedProgress = true;
    }
    if (!this.multiplayerSessionActive) {
      this.autosaveTimer += dt;
      if (this.autosaveTimer >= 45) {
        this.autosaveTimer = 0;
        // Save silently back to active world so Continue & Load World stay up to date
        const targetSlot = this.activeSaveSlot || 'autosave';
        this.saveManager.saveToSlot(targetSlot, this.captureSaveSource(false));
        this.hasUnsavedProgress = false;
        this.unsavedTimer = 0;
      }
    }

    const input = this.input.consumeInput(this.settings, this.mobileSettings, dt);

    // Update nearby interactables before controller processes interact trigger
    this.updateProximityInteractables();

    this.handleBowChargeInput(dt, input);
    this.controller.update(dt, input);
    this.player.setFirstPersonMode(
      this.cameraRig.isFirstPersonActive(),
      this.cameraRig.getPitch(),
    );
    this.updateInteractionIndicatorScreenPos();
    if (this.combat.isChargingBow()) {
      this.updateBowAimAndTrajectoryPreview();
    }
    const px = this.controller.position.x;
    const pz = this.controller.position.z;
    this.statAccumTimeSec += dt;
    if (this.lastStatTrackX !== null && this.lastStatTrackZ !== null) {
      const stepDist = Math.hypot(px - this.lastStatTrackX, pz - this.lastStatTrackZ);
      if (stepDist > 0.01 && stepDist < 35) {
        this.statAccumDistM += stepDist;
      }
    }
    this.lastStatTrackX = px;
    this.lastStatTrackZ = pz;
    if (this.statAccumTimeSec >= 5) {
      const wholeSec = Math.floor(this.statAccumTimeSec);
      const wholeDist = Math.floor(this.statAccumDistM);
      this.statAccumTimeSec -= wholeSec;
      this.statAccumDistM -= wholeDist;
      if (wholeSec > 0 || wholeDist > 0) {
        ProfileManager.recordGameplayDelta({
          ...(wholeSec > 0 ? { playTimeSeconds: wholeSec } : {}),
          ...(wholeDist > 0 ? { distanceTraveledMeters: wholeDist } : {}),
        });
      }
    }
    if (
      !Number.isFinite(this.lastFogRevealX) ||
      !Number.isFinite(this.lastFogRevealZ) ||
      (px - this.lastFogRevealX) ** 2 + (pz - this.lastFogRevealZ) ** 2 > 16 * 16
    ) {
      this.mapManager.revealAround(px, pz, 190);
      this.lastFogRevealX = px;
      this.lastFogRevealZ = pz;
    }

    this.combat.syncPlayerStats(
      this.controller.getHealth(),
      this.controller.getMaxHealth(),
    );
    this.combat.update(
      dt,
      this.elapsed,
      this.controller.position,
      this.camera,
      this.queryCollidersCb,
      this.isVillageClearanceCb,
    );
    this.timeManager.update(dt);
    this.weatherManager.update(dt, getBiomeAt(px, pz));
    const weatherSnap = this.weatherManager.getSnapshot();
    if (
      this.multiplayerSessionActive &&
      this.multiplayerService &&
      !this.isApplyingRemoteTimeWeather &&
      this.isLocalMultiplayerHost() &&
      weatherSnap.currentState !== this.lastSyncedWeatherState
    ) {
      this.lastSyncedWeatherState = weatherSnap.currentState;
      this.multiplayerService.sendGameEvent('WORLD_EVENT', {
        kind: 'weather_changed',
        weather: weatherSnap.currentState,
      });
    }
    this.sound.updateWeatherAudio(
      weatherSnap.atmosphere.rainIntensity,
      weatherSnap.atmosphere.windStrength,
      true,
      this.elapsed,
    );
    this.skyRig.updateTimeOfDay(
      this.timeManager.getWorldHours(),
      this.elapsed,
      weatherSnap,
    );
    this.skyRig.updateSunFollow(this.controller.position);
    this.weatherEffects.update(
      this.elapsed,
      this.controller.position,
      weatherSnap,
      this.timeManager.getNightFactor(),
    );
    this.atmosphericParticles.update(
      this.elapsed,
      this.controller.position,
      weatherSnap,
      this.timeManager.getNightFactor(),
    );

    // Evaluate rolling FPS & dynamically adapt quality with hysteresis + cooldown
    if (this.graphicsManager) {
      const adapt = this.graphicsManager.evaluateDynamicFps(
        dt,
        this.elapsed,
        this.performanceMonitor.getSmoothedFps(),
        this.performanceMonitor.hasWarmSamples(),
      );
      if (adapt.adapted) {
        this.applyResolvedProfile(adapt.profile, {
          texturesChanged: adapt.texturesChanged,
          vegetationChanged: adapt.vegetationChanged,
          shadowMapSizeChanged: adapt.shadowMapSizeChanged,
          emitCallback: true,
        });
      }
    }

    // Evaluate spatial/collection quest objectives ~6Hz
    this.questEvalTimer += dt;
    let questChanged = false;
    if (this.questEvalTimer >= 0.16) {
      this.questEvalTimer = 0;
      questChanged = this.dialogueEngine.quests.update(
        this.dialogueBridge,
        (msg) => this.callbacks.onWorldNotice(msg),
      );
    }

    if (this.multiplayerSessionActive) {
      this.syncLocalMultiplayerState(dt);
    }

    // Emit HUD snapshot (~13Hz or immediately on interactable/quest/combat target/cooldown/bow charge change)
    this.hudEmitTimer += dt;
    const nearbyId = this.nearbyInteractable?.id ?? null;
    const combatTarget = this.combat.getHudTarget();
    const combatKey = combatTarget ? `${combatTarget.id}:${combatTarget.health}` : null;
    const cooldownActive = this.combat.getAttackCooldownRatio() > 0;
    const bowCharging = this.combat.isChargingBow();
    const bowChargePct = bowCharging
      ? Math.round(this.combat.getBowChargeProgress() * 100)
      : -1;
    const bowTargetType = bowCharging ? this.bowTargetType : 'none';
    const activePerspective = this.cameraRig.getPerspective();
    if (
      this.hudEmitTimer >= 0.075 ||
      nearbyId !== this.lastNearbyId ||
      combatKey !== this.lastCombatTargetKey ||
      cooldownActive !== this.lastCooldownActive ||
      bowCharging !== this.lastBowCharging ||
      (bowCharging && Math.abs(bowChargePct - this.lastBowChargePct) >= 3) ||
      bowTargetType !== this.lastBowTargetType ||
      activePerspective !== this.lastCameraPerspective ||
      Math.abs(this.indicatorX - this.lastIndicatorX) >= 0.25 ||
      Math.abs(this.indicatorY - this.lastIndicatorY) >= 0.25 ||
      questChanged
    ) {
      this.hudEmitTimer = 0;
      this.lastNearbyId = nearbyId;
      this.lastCombatTargetKey = combatKey;
      this.lastCooldownActive = cooldownActive;
      this.lastBowCharging = bowCharging;
      this.lastBowChargePct = bowChargePct;
      this.lastBowTargetType = bowTargetType;
      this.lastCameraPerspective = activePerspective;
      this.lastIndicatorX = this.indicatorX;
      this.lastIndicatorY = this.indicatorY;
      this.emitHud();
    }
  }

  private updateInteractionIndicatorScreenPos(): void {
    if (!this.camera || !this.cameraRig || !this.controller) return;
    const mode = this.cameraRig.getPerspective();
    if (mode === 'first-person') {
      this.indicatorX = 50;
      this.indicatorY = 50;
      return;
    }

    const ox = this.cameraSettings.interactionIndicatorOffsetX;
    const oy = this.cameraSettings.interactionIndicatorOffsetY;
    const oz = this.cameraSettings.interactionIndicatorOffsetZ;

    if (mode === 'second-person') {
      const depthScale = 1 / Math.max(0.6, 1 + oz * 0.25);
      const rawX = 50 + ox * 16 * depthScale;
      const rawY = 50 - oy * 16 * depthScale;
      this.indicatorX = Math.round(Math.max(22, Math.min(78, rawX)) * 10) / 10;
      this.indicatorY = Math.round(Math.max(20, Math.min(80, rawY)) * 10) / 10;
      return;
    }

    // Third Person: project world-space offset point to the side of the player character
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this._camForwardVec);
    this._camRightVec.crossVectors(this._camForwardVec, this.camera.up).normalize();
    this._camUpVec.crossVectors(this._camRightVec, this._camForwardVec).normalize();

    const depth = Math.max(2.5, 7.5 + oz * 2.5);
    this._indicatorWorld
      .set(
        this.controller.position.x,
        this.controller.position.y + 1.48,
        this.controller.position.z,
      )
      .addScaledVector(this._camForwardVec, depth)
      .addScaledVector(this._camRightVec, ox * 1.65)
      .addScaledVector(this._camUpVec, oy * 1.35);

    this._indicatorWorld.project(this.camera);
    const rawX = (this._indicatorWorld.x * 0.5 + 0.5) * 100;
    const rawY = (-this._indicatorWorld.y * 0.5 + 0.5) * 100;
    this.indicatorX = Math.round(Math.max(22, Math.min(78, rawX)) * 10) / 10;
    this.indicatorY = Math.round(Math.max(20, Math.min(80, rawY)) * 10) / 10;
  }

  private computeCameraCenterAimTarget(
    maxRange: number,
  ): 'none' | 'enemy' | 'animal' | 'npc' {
    this.camera.updateMatrixWorld();
    const perspective = this.cameraRig?.getPerspective() ?? 'third-person';
    let minT: number;

    if (perspective === 'second-person') {
      // In Second Person the camera faces the player, so cast forward from player eye along player forward aim
      const camYaw = this.cameraRig.getYaw();
      const pitch = this.cameraRig.getPitch();
      const cosP = Math.cos(pitch);
      this._camRayOrigin.set(
        this.controller.position.x,
        this.controller.position.y + 1.48,
        this.controller.position.z,
      );
      this._camRayDir
        .set(-Math.sin(camYaw) * cosP, -Math.sin(pitch), -Math.cos(camYaw) * cosP)
        .normalize();
      minT = 0.55;
    } else {
      // In First Person & Third Person, cast directly through the HUD indicator NDC so visual marker and aim agree 100%
      const ndcX = (this.indicatorX / 100) * 2 - 1;
      const ndcY = -((this.indicatorY / 100) * 2 - 1);
      this._aimNdc.set(ndcX, ndcY);
      this._aimRaycaster.setFromCamera(this._aimNdc, this.camera);
      this._camRayOrigin.copy(this._aimRaycaster.ray.origin);
      this._camRayDir.copy(this._aimRaycaster.ray.direction);
      const playerDist = this._camRayOrigin.distanceTo(this.controller.position);
      minT =
        perspective === 'first-person' ? 0.55 : Math.max(1.0, playerDist - 0.45);
    }

    let bestT = maxRange;
    let bestType: 'none' | 'enemy' | 'animal' | 'npc' = 'none';

    // 1. March terrain & world colliders first so walls/hills block targets behind them
    const stepLen = 1.65;
    let prevT = minT;
    this._prevCamSample
      .copy(this._camRayOrigin)
      .addScaledVector(this._camRayDir, prevT);

    for (let t = minT + stepLen; t <= maxRange + stepLen * 0.5; t += stepLen) {
      const clampedT = Math.min(maxRange, t);
      this._currCamSample
        .copy(this._camRayOrigin)
        .addScaledVector(this._camRayDir, clampedT);

      const midX = (this._prevCamSample.x + this._currCamSample.x) * 0.5;
      const midZ = (this._prevCamSample.z + this._currCamSample.z) * 0.5;
      const colliders: WorldCollider[] = this.queryCollidersCb(midX, midZ);
      const colFrac = BowWeapon.intersectSegmentColliders(
        this._prevCamSample,
        this._currCamSample,
        colliders,
        0.06,
        this._camHitScratch,
      );
      if (colFrac !== null) {
        bestT = prevT + (clampedT - prevT) * colFrac;
        break;
      }

      const terrainY = groundHeightAt(this._currCamSample.x, this._currCamSample.z);
      const surfaceY = Math.max(WATER_LEVEL, terrainY);
      if (this._currCamSample.y <= surfaceY) {
        const denom = this._prevCamSample.y - this._currCamSample.y;
        const frac =
          denom > 0.0001
            ? Math.max(0, Math.min(1, (this._prevCamSample.y - surfaceY) / denom))
            : 1;
        bestT = prevT + (clampedT - prevT) * frac;
        break;
      }

      prevT = clampedT;
      this._prevCamSample.copy(this._currCamSample);
      if (clampedT >= maxRange) break;
    }

    // 2. Test enemies along unobstructed ray [minT .. bestT]
    const ox = this._camRayOrigin.x;
    const oy = this._camRayOrigin.y;
    const oz = this._camRayOrigin.z;
    const dx = this._camRayDir.x;
    const dy = this._camRayDir.y;
    const dz = this._camRayDir.z;
    const hLenSq = dx * dx + dz * dz;

    const enemies = this.combat.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (!enemy.health.isAlive()) continue;
      const t =
        hLenSq > 0.0001
          ? ((enemy.position.x - ox) * dx + (enemy.position.z - oz) * dz) / hLenSq
          : Math.abs(dy) > 0.0001
            ? (enemy.position.y + enemy.hitHeight * 0.5 - oy) / dy
            : -1;
      if (t < minT || t >= bestT) continue;
      const hx = ox + dx * t;
      const hy = oy + dy * t;
      const hz = oz + dz * t;
      const ex = hx - enemy.position.x;
      const ez = hz - enemy.position.z;
      const rad = enemy.hitRadius + 0.25;
      if (
        ex * ex + ez * ez <= rad * rad &&
        hy >= enemy.position.y - 0.08 &&
        hy <= enemy.position.y + enemy.hitHeight + 0.28
      ) {
        bestT = t;
        bestType = 'enemy';
      }
    }

    // 3. Test wildlife along [minT .. bestT]
    this._prevCamSample
      .copy(this._camRayOrigin)
      .addScaledVector(this._camRayDir, minT);
    this._currCamSample
      .copy(this._camRayOrigin)
      .addScaledVector(this._camRayDir, bestT);
    const hitAnimal = this.world.wildlife.rayTestProjectile(
      this._prevCamSample,
      this._currCamSample,
      0.34,
    );
    if (hitAnimal) {
      const t =
        (hitAnimal.position.x - ox) * dx +
        (hitAnimal.position.y + hitAnimal.altitude + hitAnimal.traits.bodyRadius * 0.65 - oy) *
          dy +
        (hitAnimal.position.z - oz) * dz;
      if (t >= minT && t < bestT) {
        bestT = t;
        bestType = 'animal';
      }
    }

    // 4. Test NPCs along [minT .. bestT]
    this._currCamSample
      .copy(this._camRayOrigin)
      .addScaledVector(this._camRayDir, bestT);
    const npcHit = this.world.npcs.rayTestProjectile(
      this._prevCamSample,
      this._currCamSample,
      0.16,
    );
    if (npcHit) {
      const t = this._camRayOrigin.distanceTo(npcHit.hitPoint);
      if (t >= minT && t < bestT) {
        bestT = t;
        bestType = 'npc';
      }
    }

    this._bowAimTarget
      .copy(this._camRayOrigin)
      .addScaledVector(this._camRayDir, bestT);
    this.bowTargetType = bestType;
    return bestType;
  }

  private resolveBowNockOrigin(): void {
    this.player.root.updateMatrixWorld(true);
    if (!this.combat.getBowNockWorldPosition(this._bowNockOrigin)) {
      const yaw = this.controller.getYaw();
      this._bowNockOrigin.set(
        this.controller.position.x + Math.sin(yaw) * 0.52,
        this.controller.position.y + 1.38,
        this.controller.position.z + Math.cos(yaw) * 0.52,
      );
    }
  }

  private updateBowAimAndTrajectoryPreview(): void {
    if (!this.combat || !this.controller || !this.player) return;
    const bow = this.combat.getEquippedBowWeapon();
    const maxRange = bow ? bow.getChargeConfig().maxRange : 52;
    this.computeCameraCenterAimTarget(maxRange);
    this.resolveBowNockOrigin();

    const progress = this.combat.getBowChargeProgress();
    const shot = bow ? bow.computeShotParameters(progress) : null;
    const speed = shot ? shot.speed : 15 + progress * 30;
    const gravity = shot ? shot.gravity : 9.8;

    this._bowLaunchVel.subVectors(this._bowAimTarget, this._bowNockOrigin);
    if (this._bowLaunchVel.lengthSq() < 0.0001) {
      const yaw = this.controller.getYaw();
      this._bowLaunchVel.set(Math.sin(yaw), 0.06, Math.cos(yaw));
    } else {
      this._bowLaunchVel.normalize();
    }
    this._bowLaunchVel.multiplyScalar(speed);

    this.combat.updateBowTrajectoryPreview(
      this._bowNockOrigin,
      this._bowLaunchVel,
      gravity,
      progress,
      this.queryCollidersCb,
      this.showBowTrajectory,
    );
  }

  private cancelActiveBowCharge(showNotice = false): void {
    const cancelled = this.combat?.cancelBowCharge() ?? false;
    this.player?.setBowChargeState(false, 0, 0);
    this.bowFullChargePlayed = false;
    this.bowTargetType = 'none';
    this.combat?.hideBowTrajectoryPreview();
    if (cancelled) {
      this.lastBowCharging = false;
      this.lastBowChargePct = -1;
      this.lastBowTargetType = 'none';
      if (showNotice) {
        this.callbacks.onWorldNotice(UI_TEXT[this.language].bowCancelledNotice);
      }
      this.emitHud();
    }
  }

  private handleBowChargeInput(dt: number, input: UnifiedPlayerInput): void {
    if (!this.combat || !this.controller || !this.player) return;

    if (!this.combat.isRangedWeaponEquipped()) {
      if (this.combat.isChargingBow()) {
        this.cancelActiveBowCharge(false);
      } else {
        this.player.setBowChargeState(false, 0, 0);
      }
      return;
    }

    if (input.attackCancel) {
      if (this.combat.isChargingBow()) {
        this.cancelActiveBowCharge(true);
      }
      return;
    }

    if (input.attack && !this.combat.isChargingBow()) {
      if (!this.combat.canPlayerAttack()) return;
      const hasArrows =
        this.activeWorldType === 'creative' ||
        this.inventoryManager.getItemCount('arrow') > 0;
      if (!hasArrows) {
        this.sound.playBowEmpty();
        this.callbacks.onWorldNotice(UI_TEXT[this.language].bowNoArrowsNotice);
        return;
      }

      const weaponStats = this.combat.getEquippedWeaponStats();
      const minCost = Math.max(1, (weaponStats?.staminaCost ?? 4) * 0.4);
      if (this.controller.hasStaminaFor(minCost)) {
        if (this.combat.beginBowCharge()) {
          this.bowFullChargePlayed = false;
          this.sound.playBowDraw();
          this.player.setBowChargeState(true, 0, -this.cameraRig.getPitch());
        }
      }
    }

    if (this.combat.isChargingBow()) {
      if (input.attackReleased) {
        const bow = this.combat.getEquippedBowWeapon();
        const maxRange = bow ? bow.getChargeConfig().maxRange : 52;
        this.computeCameraCenterAimTarget(maxRange);
        this.resolveBowNockOrigin();

        const chargeBeforeRelease = this.combat.getBowChargeProgress();
        const res = this.combat.releaseBowCharge(
          this.controller.position,
          this.controller.getYaw(),
          this._bowNockOrigin,
          this._bowAimTarget,
        );
        this.player.setBowChargeState(false, 0, 0);
        this.bowFullChargePlayed = false;
        this.bowTargetType = 'none';

        if (res.fired) {
          if (this.activeWorldType !== 'creative') {
            this.inventoryManager.removeItem('arrow', 1);
            this.emitInventorySnapshot();
          }
          const staminaCost = res.staminaCost * (0.4 + 0.6 * chargeBeforeRelease);
          this.controller.consumeStamina(staminaCost, 0.55);
          const animSpec = this.combat.getAttackAnimationSpec();
          this.player.triggerAttack(animSpec.duration, animSpec.type);
          this.sound.playBowRelease(chargeBeforeRelease);
          if (this.multiplayerSessionActive && this.multiplayerService) {
            const weaponId = this.combat.getEquippedWeapon()?.stats.id ?? null;
            this.mpPendingShootFlag = true;
            this.mpPendingAnimState = animSpec.type;
            this.multiplayerService.sendGameEvent('player:shoot', {
              weaponId,
              animType: animSpec.type,
              bowCharge: Math.round(chargeBeforeRelease * 100) / 100,
              aimYaw: Math.round(this.cameraRig.getYaw() * 1000) / 1000,
              pitch: Math.round(-this.cameraRig.getPitch() * 1000) / 1000,
            });
          }
          const yaw = this.controller.getYaw();
          const fx = this.controller.position.x + Math.sin(yaw) * 0.9;
          const fz = this.controller.position.z + Math.cos(yaw) * 0.9;
          this.spawnDustBurst(fx, this.controller.position.y + 0.6, fz, 3);
          this.emitHud();
        } else if (res.cancelledTooShort) {
          this.emitHud();
        }
        return;
      }

      if (!input.attackHeld) {
        this.cancelActiveBowCharge(false);
        return;
      }

      this.combat.updateBowCharge(dt);
      const progress = this.combat.getBowChargeProgress();
      this.player.setBowChargeState(true, progress, -this.cameraRig.getPitch());
      if (progress >= 0.995 && !this.bowFullChargePlayed) {
        this.bowFullChargePlayed = true;
        this.sound.playBowFullCharge();
      }
    } else {
      this.player.setBowChargeState(false, 0, 0);
    }
  }

  private updateProximityInteractables(): void {
    let best: WorldInteractable | null = null;
    let bestDistSq = Infinity;
    const px = this.controller.position.x;
    const pz = this.controller.position.z;

    for (const item of this.interactables) {
      if (item.collected) continue;
      const dx = px - item.x;
      const dz = pz - item.z;
      const dSq = dx * dx + dz * dz;
      if (dSq <= item.radius * item.radius && dSq < bestDistSq) {
        bestDistSq = dSq;
        best = item;
      }

      if (dSq < 64) {
        const lm = this.landmarks.find((l) => l.id === item.id);
        if (lm && !lm.discovered) {
          lm.discovered = true;
          this.mapManager.revealAround(lm.x, lm.z, 90);
          if (
            this.multiplayerSessionActive &&
            this.multiplayerService &&
            !this.isApplyingRemoteWorldEvent
          ) {
            this.multiplayerService.sendGameEvent('WORLD_EVENT', {
              kind: 'landmark_discovered',
              landmarkId: lm.id,
            });
          }
        }
      }
    }

    for (const lm of this.landmarks) {
      if (!lm.discovered && lm.kind === 'village') {
        if ((px - lm.x) ** 2 + (pz - lm.z) ** 2 < 900) {
          lm.discovered = true;
          this.mapManager.revealAround(lm.x, lm.z, 130);
          if (
            this.multiplayerSessionActive &&
            this.multiplayerService &&
            !this.isApplyingRemoteWorldEvent
          ) {
            this.multiplayerService.sendGameEvent('WORLD_EVENT', {
              kind: 'landmark_discovered',
              landmarkId: lm.id,
            });
          }
          const rawVillageId =
            lm.id === 'village-square'
              ? 'oakhollow'
              : lm.id.replace(/^village-/, '');
          const matchedVillage = this.world?.village.villages.find(
            (v) => v.id === rawVillageId,
          );
          const displayName = matchedVillage
            ? getLocalizedVillageName(
                matchedVillage.id,
                matchedVillage.name,
                this.language,
              )
            : lm.name;
          this.callbacks.onWorldNotice(
            UI_TEXT[this.language].villageDiscoveredNotice(displayName),
          );
          if (!this.isApplyingRemoteWorldEvent) {
            ProfileManager.recordGameplayDelta({
              villagesDiscovered: 1,
              xpGained: 20,
            });
          }
          this.hasUnsavedProgress = true;
        }
      }
    }

    const nearNpc = this.world.npcs.getNearestInteractable(this.controller.position);
    if (nearNpc && nearNpc.distSq < bestDistSq) {
      bestDistSq = nearNpc.distSq;
      best = {
        id: nearNpc.info.id,
        label: nearNpc.info.label,
        actionVerb: nearNpc.info.actionVerb,
        kind: 'npc',
        x: nearNpc.npc.position.x,
        y: nearNpc.npc.position.y,
        z: nearNpc.npc.position.z,
        radius: nearNpc.npc.interactionRadius,
        collected: false,
        message: '',
      };
    }

    this.nearbyInteractable = best;
  }

  private executeInteraction(target: WorldInteractable): void {
    const t = UI_TEXT[this.language];
    this.sound.playInteract();
    this.player.triggerInteractGesture();

    if (target.kind === 'npc') {
      const profile = this.world.npcs.engageForDialogue(
        target.id,
        this.controller.position,
      );
      if (profile) {
        const snapshot = this.dialogueEngine.startDialogue(profile);
        this.callbacks.onDialogueChange(snapshot);
      }
      return;
    }

    const lm = this.landmarks.find((l) => l.id === target.id);
    if (lm && !lm.discovered) {
      lm.discovered = true;
      if (
        this.multiplayerSessionActive &&
        this.multiplayerService &&
        !this.isApplyingRemoteWorldEvent
      ) {
        this.multiplayerService.sendGameEvent('WORLD_EVENT', {
          kind: 'landmark_discovered',
          landmarkId: lm.id,
        });
      }
    }

    if (target.kind === 'well') {
      this.controller.heal(10);
      this.controller.restoreStamina(40);
      this.spawnDustBurst(target.x, target.y + 0.8, target.z, 4);
      this.callbacks.onWorldNotice(
        translateInteractableMessage(target.id, target.message, this.language),
      );
    } else if (target.kind === 'herb') {
      if (!this.inventoryManager.canAccept('meadow-herb', 1)) {
        this.callbacks.onWorldNotice(t.packFullNotice);
        return;
      }
      target.collected = true;
      if (target.meshGroup) {
        target.meshGroup.visible = false;
      }
      this.controller.heal(15);
      this.spawnDustBurst(target.x, target.y, target.z, 6);
      this.inventoryManager.addItem('meadow-herb', 1);
      if (this.multiplayerSessionActive && this.multiplayerService) {
        this.multiplayerService.sendGameEvent('ITEM_PICKED_UP', {
          pickupId: target.id,
          itemId: 'meadow-herb',
          count: 1,
          x: Math.round(target.x * 100) / 100,
          y: Math.round(target.y * 100) / 100,
          z: Math.round(target.z * 100) / 100,
        });
      } else {
        ProfileManager.recordGameplayDelta({
          resourcesCollected: 1,
          xpGained: 5,
        });
      }
      this.emitInventorySnapshot();
      this.nearbyInteractable = null;
      this.lastNearbyId = null;
      this.dialogueEngine.quests.update(this.dialogueBridge, (msg) =>
        this.callbacks.onWorldNotice(msg),
      );
      this.callbacks.onWorldNotice(t.gatheredHerbNotice);
    } else if (target.kind === 'pickup' && target.itemId) {
      const qty = target.count ?? 1;
      if (!this.inventoryManager.canAccept(target.itemId, qty)) {
        this.callbacks.onWorldNotice(t.packFullNotice);
        return;
      }
      target.collected = true;
      if (target.meshGroup) {
        target.meshGroup.visible = false;
        this.scene.remove(target.meshGroup);
      }
      this.spawnDustBurst(target.x, target.y, target.z, 6);
      this.inventoryManager.addItem(target.itemId, qty);
      if (this.multiplayerSessionActive && this.multiplayerService) {
        this.multiplayerService.sendGameEvent('ITEM_PICKED_UP', {
          pickupId: target.id,
          itemId: target.itemId,
          count: qty,
          x: Math.round(target.x * 100) / 100,
          y: Math.round(target.y * 100) / 100,
          z: Math.round(target.z * 100) / 100,
        });
      }
      this.syncEquippedWeaponFromInventory();
      this.emitInventorySnapshot();
      this.nearbyInteractable = null;
      this.lastNearbyId = null;
      this.dialogueEngine.quests.update(this.dialogueBridge, (msg) =>
        this.callbacks.onWorldNotice(msg),
      );
      const itemName = this.itemManager.getName(target.itemId, this.language);
      this.callbacks.onWorldNotice(t.pickedUpNotice(itemName, qty));
    } else if (target.kind === 'resource') {
      const previewItemId = target.resourceKind;
      const previewCount = target.yieldCount ?? 2;
      if (
        previewItemId &&
        !this.inventoryManager.canAccept(previewItemId, previewCount)
      ) {
        this.callbacks.onWorldNotice(t.packFullNotice);
        return;
      }
      const maxUses =
        target.maxUses ??
        (target.usesRemaining !== undefined ? Math.max(target.usesRemaining, 2) : 2);
      const res = this.world.collectResourceNode(target, this.elapsed);
      if (!res) return;
      this.inventoryManager.addItem(res.itemId, res.count);
      if (this.multiplayerSessionActive && this.multiplayerService) {
        this.multiplayerService.sendGameEvent('PLAYER_COLLECTED_RESOURCE', {
          nodeId: target.id,
          itemId: res.itemId,
          count: res.count,
          maxUses,
          x: Math.round(target.x * 100) / 100,
          y: Math.round(target.y * 100) / 100,
          z: Math.round(target.z * 100) / 100,
        });
      } else {
        ProfileManager.recordGameplayDelta({
          resourcesCollected: 1,
          xpGained: 5,
        });
      }
      this.spawnDustBurst(target.x, target.y + 0.5, target.z, 6);
      this.emitInventorySnapshot();
      if (res.depleted) {
        this.nearbyInteractable = null;
        this.lastNearbyId = null;
      }
      this.dialogueEngine.quests.update(this.dialogueBridge, (msg) =>
        this.callbacks.onWorldNotice(msg),
      );
      const itemName = this.itemManager.getName(res.itemId, this.language);
      this.callbacks.onWorldNotice(t.harvestedResourceNotice(itemName, res.count));
    } else if (target.kind === 'chest') {
      const res = this.world.openChest(target);
      if (!res) return;
      const summaryParts: string[] = [];
      let hasArrows = false;
      let arrowCount = 0;
      const lootItemIds: string[] = [];
      for (const entry of res.loot) {
        if (entry.itemId === 'arrow') {
          hasArrows = true;
          arrowCount += entry.count;
        }
        if (ALLOWED_WEAPON_IDS.has(entry.itemId)) {
          lootItemIds.push(entry.itemId);
        }
        if (this.inventoryManager.canAccept(entry.itemId, entry.count)) {
          this.inventoryManager.addItem(entry.itemId, entry.count);
        } else {
          const dropLabel = this.itemManager.getName(entry.itemId, 'en');
          const spawned = this.world.spawnWorldPickup(
            target.x,
            target.z,
            entry.itemId,
            entry.count,
            dropLabel,
            undefined,
            true,
          );
          if (this.multiplayerSessionActive && this.multiplayerService) {
            this.multiplayerService.sendGameEvent('ITEM_DROPPED', {
              dropId: spawned.id,
              itemId: entry.itemId,
              count: entry.count,
              label: dropLabel,
              x: Math.round(spawned.x * 100) / 100,
              y: Math.round(spawned.y * 100) / 100,
              z: Math.round(spawned.z * 100) / 100,
            });
          }
        }
        const name = this.itemManager.getName(entry.itemId, this.language);
        summaryParts.push(`${name} ×${entry.count}`);
      }
      if (this.multiplayerSessionActive && this.multiplayerService) {
        this.multiplayerService.sendGameEvent('CHEST_OPENED', {
          chestId: target.id,
          hasArrows,
          ...(arrowCount > 0 ? { arrowCount } : {}),
          ...(lootItemIds.length > 0 ? { lootItems: lootItemIds.join(',') } : {}),
          x: Math.round(target.x * 100) / 100,
          y: Math.round(target.y * 100) / 100,
          z: Math.round(target.z * 100) / 100,
        });
      }
      if (res.coins > 0 || res.xp > 0) {
        this.awardXpAndCoins(res.xp, res.coins);
        if (res.coins > 0) summaryParts.push(`+${res.coins} ${t.coinsLabel}`);
        if (res.xp > 0) summaryParts.push(`+${res.xp} ${t.xpShort}`);
      }
      this.spawnDustBurst(target.x, target.y + 0.6, target.z, 7);
      this.emitInventorySnapshot();
      this.syncEquippedWeaponFromInventory();
      this.nearbyInteractable = null;
      this.lastNearbyId = null;
      this.dialogueEngine.quests.update(this.dialogueBridge, (msg) =>
        this.callbacks.onWorldNotice(msg),
      );
      this.callbacks.onWorldNotice(
        t.chestOpenedNotice(target.label, summaryParts.join(', ')),
      );
    } else if (target.kind === 'door') {
      const nextOpen = !Boolean(target.isOpen);
      const changed = this.world.setDoorOpen(target.id, nextOpen);
      if (changed) {
        this.spawnDustBurst(target.x, target.y + 0.8, target.z, 3);
        if (this.multiplayerSessionActive && this.multiplayerService) {
          this.multiplayerService.sendGameEvent(
            nextOpen ? 'DOOR_OPENED' : 'DOOR_CLOSED',
            {
              doorId: target.id,
              x: Math.round(target.x * 100) / 100,
              z: Math.round(target.z * 100) / 100,
            },
          );
        }
      }
    } else if (target.kind === 'bed') {
      const h = this.timeManager.getWorldHours();
      if (h >= 5.5 && h < 18.0) {
        this.callbacks.onWorldNotice(t.cannotSleepDayNotice);
        return;
      }
      this.lastInteractedBed = { id: target.id, x: target.x, z: target.z };
      this.startSleepTransition();
      return;
    } else {
      this.callbacks.onWorldNotice(
        translateInteractableMessage(target.id, target.message, this.language),
      );
    }

    this.emitHud();
  }

  private startSleepTransition(): void {
    if (this.isSleeping) return;
    this.cancelActiveBowCharge(false);
    this.isSleeping = true;
    this.sleepTimer = 0;
    this.input?.clearAll();
    this.emitHud();
  }

  private completeSleepTransition(): void {
    this.isSleeping = false;
    this.sleepTimer = 0;
    this.timeManager.advanceToMorning(6.5);
    this.world.npcs.wakeAllSleepingNpcs();
    this.controller.heal(this.controller.getMaxHealth());
    this.controller.restoreStamina(this.controller.getMaxStamina());
    this.combat.syncPlayerStats(
      this.controller.getHealth(),
      this.controller.getMaxHealth(),
    );
    this.dialogueEngine.quests.onPlayerSlept(this.dialogueBridge, (msg) =>
      this.callbacks.onWorldNotice(msg),
    );
    if (this.multiplayerSessionActive && this.multiplayerService) {
      const bed = this.lastInteractedBed;
      this.multiplayerService.sendGameEvent('BED_USED', {
        bedId: bed?.id ?? 'bed',
        x: Math.round((bed?.x ?? this.controller.position.x) * 100) / 100,
        z: Math.round((bed?.z ?? this.controller.position.z) * 100) / 100,
      });
    }
    this.lastInteractedBed = null;
    this.syncWorldTimeImmediate();
    this.callbacks.onWorldNotice(UI_TEXT[this.language].goodMorningNotice);
    this.emitHud();
  }

  private getLocalizedInteractable(item: WorldInteractable): InteractableInfo {
    if (item.kind === 'pickup' && item.itemId) {
      const name = this.itemManager.getName(item.itemId, this.language);
      const count = item.count ?? 1;
      return {
        id: item.id,
        label: count > 1 ? `${name} ×${count}` : name,
        actionVerb: item.actionVerb,
        kind: item.kind,
      };
    }
    if (item.kind === 'herb') {
      return {
        id: item.id,
        label: this.itemManager.getName('meadow-herb', this.language),
        actionVerb: item.actionVerb,
        kind: item.kind,
      };
    }
    if (item.kind === 'resource') {
      const label =
        this.language === 'ar'
          ? (item.resourceKind
              ? RESOURCE_NODE_LABELS_AR[item.resourceKind] ??
                this.itemManager.getName(item.resourceKind, 'ar')
              : undefined) ?? translateInteractableLabel(item.id, item.label, 'ar')
          : item.label;
      return {
        id: item.id,
        label,
        actionVerb: item.actionVerb,
        kind: item.kind,
      };
    }
    if (item.kind !== 'npc') {
      return {
        id: item.id,
        label: translateInteractableLabel(item.id, item.label, this.language),
        actionVerb: item.actionVerb,
        kind: item.kind,
      };
    }
    return {
      id: item.id,
      label: item.label,
      actionVerb: item.actionVerb,
      kind: item.kind,
    };
  }

  private getWeaponHudViews(): WeaponSlotHudView[] {
    return this.inventoryManager.getOwnedWeaponSlots().map((slot) => {
      const def = slot.definition;
      const weaponId = def.weaponId ?? def.id;
      const kind: WeaponSlotHudView['kind'] =
        def.icon === 'axe'
          ? 'axe'
          : def.icon === 'bow'
            ? 'bow'
            : def.icon === 'spear'
              ? 'spear'
              : def.icon === 'crossbow'
                ? 'crossbow'
                : def.icon === 'knife'
                  ? 'knife'
                  : 'sword';
      return {
        slotIndex: slot.slotIndex,
        itemId: slot.itemId,
        weaponId,
        name: def.name,
        nameAr: def.nameAr,
        kind,
        damage: def.weaponStats?.damage ?? 20,
        cooldown: def.weaponStats?.cooldown ?? 0.5,
        range: def.weaponStats?.range ?? 2.8,
        isRanged: Boolean(def.weaponStats?.isRanged),
        equipped: slot.equipped,
        durability: slot.durability,
        maxDurability: slot.maxDurability,
      };
    });
  }

  private emitHud(): void {
    if (!this.controller || !this.world) return;
    const pos = this.controller.position;
    const heading = this.cameraRig.getHeadingDegrees();
    const nearby: InteractableInfo | null = this.nearbyInteractable
      ? this.getLocalizedInteractable(this.nearbyInteractable)
      : null;
    const ownedWeapons = this.getWeaponHudViews();
    const equippedWeapon = ownedWeapons.find((w) => w.equipped) ?? null;
    const currentBiome = getBiomeAt(pos.x, pos.z);

    this.callbacks.onHudUpdate({
      health: this.controller.getHealth(),
      maxHealth: this.controller.getMaxHealth(),
      stamina: this.controller.getStamina(),
      maxStamina: this.controller.getMaxStamina(),
      worldType: this.activeWorldType,
      x: Math.round(pos.x * 10) / 10,
      y: Math.round(pos.y * 10) / 10,
      z: Math.round(pos.z * 10) / 10,
      headingDeg: Math.round(heading),
      grounded: this.controller.isGrounded(),
      sprinting: this.controller.isSprinting(),
      speed: Math.round(this.controller.getHorizontalSpeed() * 10) / 10,
      biome: currentBiome,
      inWater: this.controller.isInWater(),
      movementState: this.controller.getMovementState(),
      nearbyInteractable: nearby,
      timeOfDayLabel: this.timeManager.getTimeOfDayLabel(this.language),
      level: this.playerLevel,
      xp: this.playerXp,
      xpToNextLevel: this.getXpToNextLevel(),
      coins: this.playerCoins,
      trackedQuest: this.dialogueEngine.quests.getTrackedQuestView(this.dialogueBridge),
      combatTarget: this.combat ? this.combat.getHudTarget() : null,
      equippedWeapon,
      weaponCooldownRatio: this.combat ? this.combat.getAttackCooldownRatio() : 0,
      ownedWeapons,
      timeSnapshot: this.timeManager.getSnapshot(),
      weatherSnapshot: this.weatherManager.getSnapshot(),
      isSleeping: this.isSleeping,
      sleepProgress: this.isSleeping
        ? Math.max(0, Math.min(1, this.sleepTimer / this.SLEEP_DURATION_SEC))
        : 0,
      isChargingBow: this.combat ? this.combat.isChargingBow() : false,
      bowChargeProgress: this.combat ? this.combat.getBowChargeProgress() : 0,
      bowMaxCharge: this.combat ? this.combat.isBowMaxCharged() : false,
      arrowCount:
        this.activeWorldType === 'creative'
          ? 999
          : this.inventoryManager.getItemCount('arrow'),
      bowTargetType: this.combat?.isChargingBow() ? this.bowTargetType : 'none',
      showBowTrajectory: this.showBowTrajectory,
      cameraPerspective: this.getCameraPerspective(),
      indicatorX: this.indicatorX,
      indicatorY: this.indicatorY,
      biomeMaterialId: this.world.getExpectedTerrainMaterialId(currentBiome),
      biomeValidationOk: this.biomeValidationOk,
    });
  }

  private handleResize = (): void => {
    if (!this.renderer || !this.camera) return;
    const vpState = OrientationManager.getState();
    const w = Math.max(1, this.container.clientWidth || vpState.width);
    const h = Math.max(1, this.container.clientHeight || vpState.height);
    const pr = this.graphicsManager
      ? this.graphicsManager.getProfile().pixelRatio
      : this.isSoftwareGl
        ? 1
        : Math.min(window.devicePixelRatio || 1, 1.5);

    if (
      w === this.lastResizeW &&
      h === this.lastResizeH &&
      Math.abs(pr - this.lastResizePr) < 0.001
    ) {
      return;
    }

    this.lastResizeW = w;
    this.lastResizeH = h;
    this.lastResizePr = pr;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.postProcessing?.setSize(w, h, pr);
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
  };

  private syncLocalMultiplayerState(dt: number, forceImmediate = false): void {
    if (!this.multiplayerSessionActive || !this.multiplayerService || !this.controller || !this.combat) {
      return;
    }

    this.mpSyncTimer += dt;
    this.mpKeepaliveTimer += dt;

    const pos = this.controller.position;
    const vel = this.controller.velocity;
    const yaw = this.controller.getYaw();
    const aimYaw = this.cameraRig?.getYaw() ?? yaw;
    const pitch = -(this.cameraRig?.getPitch() ?? 0);
    const movementState = this.controller.getMovementState();
    const grounded = this.controller.isGrounded();
    const sprinting = this.controller.isSprinting();
    const jumping = !grounded && vel.y > 0.2;
    const crouching = false;
    const weaponId = this.combat.getEquippedWeapon()?.stats.id ?? null;
    const bowCharging = this.combat.isChargingBow();
    const bowCharge = bowCharging ? Math.round(this.combat.getBowChargeProgress() * 100) / 100 : 0;
    const reloading =
      this.combat.isRangedWeaponEquipped() &&
      !bowCharging &&
      this.combat.getAttackCooldownRatio() > 0;
    const shooting = this.mpPendingShootFlag;
    const animState = this.mpPendingAnimState;

    const digest = [
      Math.round(pos.x * 100),
      Math.round(pos.y * 100),
      Math.round(pos.z * 100),
      Math.round(yaw * 100),
      Math.round(aimYaw * 100),
      Math.round(pitch * 100),
      movementState,
      sprinting ? 1 : 0,
      jumping ? 1 : 0,
      grounded ? 1 : 0,
      weaponId ?? '',
      bowCharging ? 1 : 0,
      Math.round(bowCharge * 25),
      reloading ? 1 : 0,
    ].join('|');

    const urgent = forceImmediate || shooting || Boolean(animState);
    const changed = digest !== this.mpLastSentDigest;
    const shouldSend = urgent || (changed && this.mpSyncTimer >= 0.04) || this.mpKeepaliveTimer >= 0.25;
    if (!shouldSend) return;

    this.mpOutboundSeq += 1;
    const statePayload: PlayerNetworkState = {
      x: Math.round(pos.x * 1000) / 1000,
      y: Math.round(pos.y * 1000) / 1000,
      z: Math.round(pos.z * 1000) / 1000,
      yaw: Math.round(yaw * 1000) / 1000,
      aimYaw: Math.round(aimYaw * 1000) / 1000,
      pitch: Math.round(pitch * 1000) / 1000,
      vx: Math.round(vel.x * 100) / 100,
      vy: Math.round(vel.y * 100) / 100,
      vz: Math.round(vel.z * 100) / 100,
      movementState,
      ...(animState ? { animState } : {}),
      sprinting,
      jumping,
      crouching,
      grounded,
      weaponId,
      bowCharging,
      bowCharge,
      shooting,
      reloading,
      seq: this.mpOutboundSeq,
    };

    const sent = this.multiplayerService.sendPlayerState(statePayload, urgent);
    if (sent) {
      this.mpSyncTimer = 0;
      this.mpKeepaliveTimer = 0;
      this.mpLastSentDigest = digest;
      this.mpPendingShootFlag = false;
      this.mpPendingAnimState = undefined;
    }

    if (this.isLocalMultiplayerHost() && this.multiplayerService.sendEntitySync && this.world) {
      this.mpEntitySyncTimer += dt;
      this.mpWeatherTimeHeartbeatTimer += dt;
      if (forceImmediate || this.mpEntitySyncTimer >= 0.125) {
        this.mpEntitySyncTimer = 0;
        const centers: Array<{ x: number; z: number }> = [{ x: pos.x, z: pos.z }];
        const roomPlayers = this.multiplayerService.getRoomState()?.players ?? [];
        for (const p of roomPlayers) {
          if (p.id !== this.localMultiplayerPlayerId && p.state) {
            centers.push({ x: p.state.x, z: p.state.z });
          }
        }
        const enemyDeltas = this.combat.exportSyncDeltas(centers, 8, 80);
        const animalDeltas = this.world.wildlife.exportSyncDeltas(centers, 7, 75);
        const npcDeltas = this.world.npcs.exportSyncDeltas(centers, 7, 75);
        const combined = [...enemyDeltas, ...animalDeltas, ...npcDeltas].slice(0, 22);

        if (combined.length > 0 || this.mpWeatherTimeHeartbeatTimer >= 2.0) {
          this.mpWeatherTimeHeartbeatTimer = 0;
          this.multiplayerService.sendEntitySync({
            entities: combined,
            worldHours: Math.round(this.timeManager.getWorldHours() * 1000) / 1000,
            weather: this.weatherManager.getSnapshot().currentState,
          });
        }
      }
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.teardownMultiplayerSync();
    this.unsubscribeOrientation?.();
    this.unsubscribeOrientation = null;

    if (this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    }

    this.input?.dispose();
    this.sound.dispose();
    this.combat?.dispose();
    this.player?.dispose();
    this.worldGenDebugRenderer?.dispose();
    this.worldGenDebugRenderer = null;
    this.world?.dispose();
    this.atmosphericParticles?.dispose();
    this.weatherEffects?.dispose();
    this.skyRig?.dispose();
    this.textures?.dispose();
    this.dustGeo?.dispose();
    this.dustMat?.dispose();
    this.dustMesh?.removeFromParent();
    this.postProcessing?.dispose();
    this.renderer?.dispose();

    if (this.renderer?.domElement?.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
