import * as THREE from 'three';
import type {
  InteractableInfo,
  NpcDialogueSession,
  NpcRole,
  NpcRoutinePeriod,
  WorldCollider,
} from '../types';
import {
  PLAYABLE_RADIUS,
  getBiomeAt,
  groundHeightAt,
  seededRandom,
} from '../math/noise';
import {
  findNearestValidLand,
  isValidNPCSpawnLocation,
} from '../world/WorldPlacementValidator';
import type { DialogueNpcProfile } from '../dialogue/dialogueTypes';
import type { ResolvedGraphicsProfile } from '../engine/GraphicsQualityManager';
import type { VillageHouseRecord, VillageSite, VillageSiteRecord } from '../world/VillageManager';
import type { EnemyController } from '../combat/EnemyController';
import type { DamageSystem } from '../combat/DamageSystem';
import {
  PERIOD_LABELS,
  getLocalizedVillageName,
  type Language,
} from '../i18n/translations';
import type { SyncedEntityDelta } from '../../../shared/multiplayerProtocol';
import { createNpcSharedAssets, type NpcSharedAssets } from './NpcRig';
import { NPCBase, type NpcConfig, type NpcTickContext } from './NPCBase';
import {
  BlacksmithNPC,
  ElderNPC,
  FarmerNPC,
  GuardNPC,
  HunterNPC,
  MerchantNPC,
  VillagerNPC,
  WoodcutterNPC,
  createNpcByRole,
} from './NpcTypes';

const NPC_DRAW_DIST = 165;
const NPC_DRAW_DIST_SQ = NPC_DRAW_DIST * NPC_DRAW_DIST;
const NAMEPLATE_DRAW_DIST = 48;
const NAMEPLATE_DRAW_DIST_SQ = NAMEPLATE_DRAW_DIST * NAMEPLATE_DRAW_DIST;
const NPC_SHADOW_DIST_SQ = 45 * 45;
const NPC_MID_DIST_SQ = 105 * 105;
const _npcHitPoint = new THREE.Vector3();

export class NPCManager {
  public readonly npcs: NPCBase[] = [];

  private readonly scene: THREE.Scene;
  private readonly assets: NpcSharedAssets;
  private readonly npcGroup = new THREE.Group();
  private readonly positionCache: Array<{ id: string; x: number; z: number }> = [];
  private readonly chunkNpcs = new Map<string, NPCBase[]>();
  private readonly villageNpcIds = new Set<string>();

  private drawDistSq = NPC_DRAW_DIST_SQ;
  private nameplateDistSq = NAMEPLATE_DRAW_DIST_SQ;
  private shadowDistSq = NPC_SHADOW_DIST_SQ;
  private midDistSq = NPC_MID_DIST_SQ;
  private shadowsEnabled = true;
  private farPause = false;
  private visibleNpcCount = 0;

  private worldHours = 8.5; // Starts at 08:30 AM (Morning)
  private readonly hoursPerRealSecond = 1 / 25; // 1 game hour every 25s so routines evolve naturally
  private activeDialogueNpc: NPCBase | null = null;
  private language: Language = 'en';
  private frameCounter = 0;
  private readonly tickCtx: NpcTickContext;
  private readonly visibleNpcScratch: Array<{ npc: NPCBase; index: number; distSq: number }> = [];
  private networkRemoteControlled = false;
  private readonly lastSyncSnapshot = new Map<
    string,
    { x: number; y: number; z: number; yaw: number; state: string; hp: number; isDead: boolean }
  >();
  private enemyCombatProvider:
    | (() => { enemies: readonly EnemyController[]; damageSystem: DamageSystem } | null)
    | null = null;

  constructor(
    scene: THREE.Scene,
    contactShadowMap: THREE.Texture,
    villageSite: VillageSite,
    villages?: VillageSiteRecord[],
  ) {
    this.scene = scene;
    this.assets = createNpcSharedAssets(contactShadowMap);
    this.scene.add(this.npcGroup);

    this.tickCtx = {
      dt: 0,
      elapsed: 0,
      period: 'morning',
      playerPos: new THREE.Vector3(),
      queryCollidersNear: () => [],
      otherNpcPositions: this.positionCache,
    };

    const oakhollow = villages?.find((v) => v.id === 'oakhollow');
    this.spawnVillageNpcs(villageSite, oakhollow?.houses ?? [], oakhollow);
    if (villages) {
      for (const v of villages) {
        if (v.id === 'oakhollow') continue;
        if (v.isProcedural) {
          this.spawnProceduralVillageNpcs(v);
        } else {
          this.spawnRegionalVillageNpcs(v);
        }
      }
    }
  }

  public setEnemyCombatProvider(
    provider:
      | (() => { enemies: readonly EnemyController[]; damageSystem: DamageSystem } | null)
      | null,
  ): void {
    this.enemyCombatProvider = provider;
  }

  public setNetworkRemoteControlled(remote: boolean): void {
    if (this.networkRemoteControlled === remote) return;
    this.networkRemoteControlled = remote;
    for (let i = 0; i < this.npcs.length; i++) {
      this.npcs[i].setNetworkRemoteControlled(remote);
    }
  }

  public setLanguage(lang: Language): void {
    if (this.language === lang) return;
    this.language = lang;
    for (const npc of this.npcs) {
      npc.setLanguage(lang);
    }
  }

  public getRoutinePeriod(): NpcRoutinePeriod {
    const h = this.worldHours;
    if (h >= 6 && h < 12) return 'morning';
    if (h >= 12 && h < 17.5) return 'midday';
    if (h >= 17.5 && h < 21.5) return 'evening';
    return 'night';
  }

  public getTimeOfDayLabel(): string {
    const wholeHour = Math.floor(this.worldHours) % 24;
    const mins = Math.floor((this.worldHours % 1) * 60);
    const hh = String(wholeHour).padStart(2, '0');
    const mm = String(mins).padStart(2, '0');
    const period = this.getRoutinePeriod();
    const label = PERIOD_LABELS[this.language][period];
    return `${hh}:${mm} · ${label}`;
  }

  public getWorldHours(): number {
    return this.worldHours;
  }

  public setWorldHours(hours: number): void {
    this.worldHours = ((hours % 24) + 24) % 24;
  }

  public wakeAllSleepingNpcs(): void {
    for (let i = 0; i < this.npcs.length; i++) {
      this.npcs[i].wakeToMorningOutdoor();
    }
  }

  private buildHomeProps(house?: VillageHouseRecord): Partial<NpcConfig> {
    if (!house) return {};
    return {
      homeId: house.id,
      bedId: house.bedId,
      homeEntryPos: { x: house.doorEntryPos.x, z: house.doorEntryPos.z },
      homeThresholdPos: { x: house.doorThresholdPos.x, z: house.doorThresholdPos.z },
      bedPos: {
        x: house.bedPos.x,
        y: house.bedPos.y,
        z: house.bedPos.z,
        yaw: house.bedYaw,
      },
    };
  }

  private spawnVillageNpcs(
    site: VillageSite,
    houses: VillageHouseRecord[] = [],
    oakhollowRecord?: VillageSiteRecord,
  ): void {
    const cx = site.centerX;
    const cz = site.centerZ;
    const h = (idx: number) =>
      houses.length > 0 ? houses[idx % houses.length] : undefined;

    const addNpc = (npc: NPCBase) => {
      this.npcs.push(npc);
      this.villageNpcIds.add(npc.id);
      this.npcGroup.add(npc.rig.root);
      this.positionCache.push({
        id: npc.id,
        x: npc.position.x,
        z: npc.position.z,
      });
    };

    // 1. Villagers (2)
    addNpc(
      new VillagerNPC(
        {
          id: 'npc-rowan',
          name: 'Rowan',
          title: 'Village Chronicler',
          ...this.buildHomeProps(h(0)),
          workplaceId: 'oakhollow-square',
          spawn: { x: cx - 2.6, z: cz + 2.8 },
          greetings: {
            morning: 'Good morning, traveler! The mist is lifting off the northern peaks.',
            midday: 'Welcome to Oakhollow Square. Check the notice board if you seek landmarks.',
            evening: 'Nothing beats the warm lantern glow around the well at dusk.',
            night: 'Heading back toward my cottage soon—stay warm out on the trails.',
          },
          choices: [
            {
              id: 'village',
              label: 'Tell me about Oakhollow Village.',
              reply:
                'Oakhollow grew around this sweet-water spring. Bakers, herbalists, farmers, and wardens keep the valley thriving.',
              nextState: 'continue',
            },
            {
              id: 'landmarks',
              label: 'Where should I explore next?',
              reply:
                'Follow the road west for the woodland lake and river, head north to climb the snowy ridges, or cross east into the desert dunes.',
              nextState: 'continue',
            },
            {
              id: 'bye',
              label: 'Safe travels, Rowan.',
              reply: 'May your boots hold true on every trail!',
              nextState: 'close',
            },
          ],
          schedule: [
            {
              period: 'morning',
              activityLabel: 'Strolling by the Well',
              anchor: { x: cx - 2.5, z: cz + 2.5 },
              mode: 'wander',
              wanderRadius: 5.5,
            },
            {
              period: 'midday',
              activityLabel: 'Visiting Notice Board',
              anchor: { x: cx - 1.2, z: cz - 6.8 },
              mode: 'wander',
              wanderRadius: 4.5,
            },
            {
              period: 'evening',
              activityLabel: 'Resting near Square Bench',
              anchor: { x: cx - 3.8, z: cz + 3.2 },
              mode: 'station',
              wanderRadius: 2.0,
              facingYaw: Math.PI * 0.65,
            },
            {
              period: 'night',
              activityLabel: 'Home by West Cottage',
              anchor: { x: cx - 11.4, z: cz + 7.2 },
              mode: 'station',
              wanderRadius: 1.5,
              facingYaw: Math.PI * 0.5,
            },
          ],
        },
        this.assets,
      ),
    );

    addNpc(
      new VillagerNPC(
        {
          id: 'npc-clara',
          name: 'Clara',
          title: 'Botanist & Villager',
          spawn: { x: cx + 4.4, z: cz - 5.2 },
          greetings: {
            morning: 'I am checking the flower planters before the sun gets too high.',
            midday: 'Meadow herbs grow wild in the western woods—great for patching scrapes.',
            evening: 'The wind off the southern coastline carries salt air all the way here.',
            night: 'Time to turn in for the night. Look after your pack!',
          },
          choices: [
            {
              id: 'herbs',
              label: 'Any tips on Meadow Herbs?',
              reply:
                'Look for bright golden blossoms near tree clearings. Gathering them heals you right away and adds spare bundles to your Explorer Pack.',
              nextState: 'continue',
            },
            {
              id: 'well',
              label: 'What does the village well do?',
              reply:
                'Draw water at the stone well in the center of the square whenever you need a quick burst of energy and recovery.',
              nextState: 'continue',
            },
            {
              id: 'bye',
              label: 'Thanks, Clara.',
              reply: 'Happy foraging out there!',
              nextState: 'close',
            },
          ],
          schedule: [
            {
              period: 'morning',
              activityLabel: 'Tending Square Planters',
              anchor: { x: cx + 4.2, z: cz - 6.8 },
              mode: 'wander',
              wanderRadius: 4.5,
            },
            {
              period: 'midday',
              activityLabel: 'Walking South Lane',
              anchor: { x: cx + 2.5, z: cz + 7.5 },
              mode: 'wander',
              wanderRadius: 5.0,
            },
            {
              period: 'evening',
              activityLabel: 'Chatting near the Well',
              anchor: { x: cx + 4.2, z: cz - 1.5 },
              mode: 'wander',
              wanderRadius: 3.5,
            },
            {
              period: 'night',
              activityLabel: 'Resting at South Cottage',
              anchor: { x: cx - 7.6, z: cz + 13.4 },
              mode: 'station',
              wanderRadius: 1.5,
              facingYaw: 0,
            },
          ],
        },
        this.assets,
      ),
    );

    // 2. Merchants (3)
    addNpc(
      new MerchantNPC(
        {
          id: 'npc-bram',
          name: 'Bram',
          title: 'Sunstone Baker',
          shopName: 'Sunstone Bakery',
          spawn: { x: cx - 7.5, z: cz - 9.8 },
          greetings: {
            morning: 'Fresh hearth loaves just came out of the oven!',
            midday: 'Sunstone Bakery is open all afternoon—step right up to the counter.',
            evening: 'Shutting down the ovens soon, just enjoying the square breeze.',
            night: 'Oven embers are banked for tonight. First batch bakes at dawn.',
          },
          choices: [
            {
              id: 'goods',
              label: 'What do you bake here?',
              reply:
                'Sourdough rounds from Oakhollow farmstead wheat, plus honey oatcakes for travelers heading up the mountain passes.',
              nextState: 'continue',
            },
            {
              id: 'farm',
              label: 'Where does your grain come from?',
              reply:
                'Toby and Maren grow all our wheat just across the southeastern farm lane.',
              nextState: 'continue',
            },
            {
              id: 'bye',
              label: 'Smells delicious, Bram.',
              reply: 'Come back anytime the hearth is lit!',
              nextState: 'close',
            },
          ],
          schedule: [
            {
              period: 'morning',
              activityLabel: 'Opening Sunstone Bakery',
              anchor: { x: cx - 7.5, z: cz - 10.0 },
              mode: 'work',
              wanderRadius: 1.8,
              facingYaw: 0,
            },
            {
              period: 'midday',
              activityLabel: 'Tending Bakery Stall',
              anchor: { x: cx - 7.5, z: cz - 10.0 },
              mode: 'station',
              wanderRadius: 1.2,
              facingYaw: 0,
            },
            {
              period: 'evening',
              activityLabel: 'Unwinding in the Square',
              anchor: { x: cx - 4.8, z: cz - 2.6 },
              mode: 'wander',
              wanderRadius: 3.5,
            },
            {
              period: 'night',
              activityLabel: 'Closing Up Bakery',
              anchor: { x: cx - 7.5, z: cz - 10.4 },
              mode: 'station',
              wanderRadius: 1.0,
              facingYaw: Math.PI,
            },
          ],
        },
        this.assets,
      ),
    );

    addNpc(
      new MerchantNPC(
        {
          id: 'npc-lyra',
          name: 'Lyra',
          title: 'Herbalist Merchant',
          shopName: 'Willow Apothecary',
          spawn: { x: cx + 7.6, z: cz - 9.8 },
          greetings: {
            morning: 'Sorting fresh valley herbs at Willow Apothecary.',
            midday: 'Need supplies for the wilds? Keep an eye out for golden meadow herbs.',
            evening: 'Sorting glass vials under the lantern light—peaceful work.',
            night: 'The apothecary counter is shuttered until morning.',
          },
          choices: [
            {
              id: 'tonics',
              label: 'What remedies do you trade?',
              reply:
                'Drying bundles of alpine sage and meadow herb. Use any herbs in your pack whenever your health runs low.',
              nextState: 'continue',
            },
            {
              id: 'biomes',
              label: 'Which region has rare flora?',
              reply:
                'The western woods and rolling plains hold lush herbs, while cacti rule the eastern desert.',
              nextState: 'continue',
            },
            {
              id: 'bye',
              label: 'See you later, Lyra.',
              reply: 'Stay healthy out there!',
              nextState: 'close',
            },
          ],
          schedule: [
            {
              period: 'morning',
              activityLabel: 'Arranging Herb Bundles',
              anchor: { x: cx + 7.6, z: cz - 9.9 },
              mode: 'work',
              wanderRadius: 1.8,
              facingYaw: 0,
            },
            {
              period: 'midday',
              activityLabel: 'Tending Apothecary Stall',
              anchor: { x: cx + 7.6, z: cz - 9.9 },
              mode: 'station',
              wanderRadius: 1.0,
              facingYaw: 0,
            },
            {
              period: 'evening',
              activityLabel: 'Checking Well Supplies',
              anchor: { x: cx + 4.8, z: cz - 4.2 },
              mode: 'wander',
              wanderRadius: 3.0,
            },
            {
              period: 'night',
              activityLabel: 'Resting at Apothecary',
              anchor: { x: cx + 7.6, z: cz - 10.2 },
              mode: 'station',
              wanderRadius: 1.0,
              facingYaw: Math.PI,
            },
          ],
        },
        this.assets,
      ),
    );

    addNpc(
      new MerchantNPC(
        {
          id: 'npc-garrick',
          name: 'Garrick',
          title: 'Outfitter Merchant',
          shopName: 'Valley Tool & Goods',
          spawn: { x: cx - 10.4, z: cz - 6.8 },
          greetings: {
            morning: 'Checking lantern oil and rope coils at Valley Tool & Goods.',
            midday: 'If you are climbing those northern mountains, watch your footing on steep slopes!',
            evening: 'Another busy day outfitting explorers.',
            night: 'Storing the crates inside for the night.',
          },
          choices: [
            {
              id: 'gear',
              label: 'Any advice for long journeys?',
              reply:
                'Pace your sprints so your stamina recovers smoothly, and open your World Map (M) to spot discovered cairns and signposts.',
              nextState: 'continue',
            },
            {
              id: 'bye',
              label: 'Good advice, Garrick.',
              reply: 'Travel smart, adventurer!',
              nextState: 'close',
            },
          ],
          schedule: [
            {
              period: 'morning',
              activityLabel: 'Inspecting Supply Crates',
              anchor: { x: cx - 10.4, z: cz - 6.8 },
              mode: 'work',
              wanderRadius: 1.6,
              facingYaw: Math.PI * 0.5,
            },
            {
              period: 'midday',
              activityLabel: 'Tending Tool & Goods Stall',
              anchor: { x: cx - 10.4, z: cz - 6.8 },
              mode: 'station',
              wanderRadius: 1.0,
              facingYaw: Math.PI * 0.5,
            },
            {
              period: 'evening',
              activityLabel: 'Visiting South Bench',
              anchor: { x: cx - 5.2, z: cz + 4.8 },
              mode: 'wander',
              wanderRadius: 3.0,
            },
            {
              period: 'night',
              activityLabel: 'Guarding Shopfront',
              anchor: { x: cx - 10.8, z: cz - 6.8 },
              mode: 'station',
              wanderRadius: 1.0,
              facingYaw: Math.PI * 0.5,
            },
          ],
        },
        this.assets,
      ),
    );

    // 3. Farmers (2)
    addNpc(
      new FarmerNPC(
        {
          id: 'npc-toby',
          name: 'Toby',
          title: 'Wheat Farmer',
          spawn: { x: cx + 18.5, z: cz + 11.5 },
          greetings: {
            morning: 'Morning! Dew on the wheat stalks means a fine harvest ahead.',
            midday: 'Hauling grain sacks up from the beds to the cart.',
            evening: 'Checking the fence rails before sunset.',
            night: 'Even a farmer hangs up his straw hat after dark.',
          },
          choices: [
            {
              id: 'crops',
              label: 'How are the crops growing?',
              reply:
                'Oakhollow soil stays rich thanks to the nearby valley springs. Both the golden wheat and leafy greens are flourishing.',
              nextState: 'continue',
            },
            {
              id: 'scarecrow',
              label: 'Does the scarecrow help?',
              reply:
                'Keeps the cheeky valley crows out of the wheat while I deliver flour to Bram.',
              nextState: 'continue',
            },
            {
              id: 'bye',
              label: 'Keep up the good work, Toby.',
              reply: 'Much obliged, friend!',
              nextState: 'close',
            },
          ],
          schedule: [
            {
              period: 'morning',
              activityLabel: 'Tending Wheat Fields',
              anchor: { x: cx + 19.0, z: cz + 11.2 },
              mode: 'work',
              wanderRadius: 3.5,
            },
            {
              period: 'midday',
              activityLabel: 'Loading Farm Cart',
              anchor: { x: cx + 12.2, z: cz + 9.4 },
              mode: 'wander',
              wanderRadius: 3.8,
            },
            {
              period: 'evening',
              activityLabel: 'Watering Vegetable Beds',
              anchor: { x: cx + 18.5, z: cz + 16.5 },
              mode: 'work',
              wanderRadius: 3.2,
            },
            {
              period: 'night',
              activityLabel: 'Resting at East Cottage',
              anchor: { x: cx + 11.5, z: cz - 6.8 },
              mode: 'station',
              wanderRadius: 1.4,
              facingYaw: -Math.PI * 0.5,
            },
          ],
        },
        this.assets,
      ),
    );

    addNpc(
      new FarmerNPC(
        {
          id: 'npc-maren',
          name: 'Maren',
          title: 'Orchard Keeper',
          spawn: { x: cx + 25.0, z: cz + 16.8 },
          greetings: {
            morning: 'Checking the orchard trees and greens plots in the cool air.',
            midday: 'Taking fresh greens toward the market lane.',
            evening: 'Pruning the orchard branches before twilight settles.',
            night: 'Heading back inside for a warm supper.',
          },
          choices: [
            {
              id: 'orchard',
              label: 'What grows in the orchard?',
              reply:
                'Crisp valley apples and hearty greens. Feel free to explore around the farmstead paths!',
              nextState: 'continue',
            },
            {
              id: 'bye',
              label: 'See you around, Maren.',
              reply: 'Enjoy the sunshine!',
              nextState: 'close',
            },
          ],
          schedule: [
            {
              period: 'morning',
              activityLabel: 'Tending Orchard & Greens',
              anchor: { x: cx + 25.2, z: cz + 16.8 },
              mode: 'work',
              wanderRadius: 3.6,
            },
            {
              period: 'midday',
              activityLabel: 'Delivering Produce to Square',
              anchor: { x: cx + 7.2, z: cz + 1.8 },
              mode: 'wander',
              wanderRadius: 3.5,
            },
            {
              period: 'evening',
              activityLabel: 'Checking Orchard Fence',
              anchor: { x: cx + 24.5, z: cz + 12.2 },
              mode: 'wander',
              wanderRadius: 3.2,
            },
            {
              period: 'night',
              activityLabel: 'Resting at South-East Cottage',
              anchor: { x: cx + 8.6, z: cz + 13.4 },
              mode: 'station',
              wanderRadius: 1.5,
              facingYaw: 0,
            },
          ],
        },
        this.assets,
      ),
    );

    // 4. Guards (2) — Peaceful patrol & village watch (no combat AI)
    addNpc(
      new GuardNPC(
        {
          id: 'npc-alden',
          name: 'Alden',
          title: 'South Gate Warden',
          spawn: { x: cx - 2.2, z: cz + 11.2 },
          greetings: {
            morning: 'All clear along the southern meadow approach, traveler.',
            midday: 'Keeping watch over the main road into Oakhollow Village.',
            evening: 'Lanterns are lit along the square—safe walking all evening.',
            night: 'Standing night watch by the village entrance.',
          },
          choices: [
            {
              id: 'roads',
              label: 'Are the roads safe?',
              reply:
                'Completely peaceful around Oakhollow. Just watch your step near steep mountain cliffs north or deep water along the western river.',
              nextState: 'continue',
            },
            {
              id: 'bye',
              label: 'Carry on, Warden.',
              reply: 'Safe travels along the valley roads!',
              nextState: 'close',
            },
          ],
          schedule: [
            {
              period: 'morning',
              activityLabel: 'Patrolling South Approach',
              anchor: { x: cx - 2.0, z: cz + 10.5 },
              mode: 'patrol',
              wanderRadius: 2.0,
              waypoints: [
                { x: cx - 2.5, z: cz + 13.5 },
                { x: cx - 2.0, z: cz + 6.0 },
                { x: cx + 3.2, z: cz + 6.0 },
                { x: cx + 2.4, z: cz + 13.5 },
              ],
            },
            {
              period: 'midday',
              activityLabel: 'Patrolling East-West Road',
              anchor: { x: cx, z: cz + 2.0 },
              mode: 'patrol',
              wanderRadius: 2.0,
              waypoints: [
                { x: cx - 12.0, z: cz + 1.5 },
                { x: cx + 12.0, z: cz + 1.5 },
                { x: cx + 12.0, z: cz - 1.5 },
                { x: cx - 12.0, z: cz - 1.5 },
              ],
            },
            {
              period: 'evening',
              activityLabel: 'Patrolling South Approach',
              anchor: { x: cx - 2.0, z: cz + 10.5 },
              mode: 'patrol',
              wanderRadius: 2.0,
              waypoints: [
                { x: cx - 2.5, z: cz + 13.5 },
                { x: cx - 2.0, z: cz + 6.0 },
                { x: cx + 3.2, z: cz + 6.0 },
              ],
            },
            {
              period: 'night',
              activityLabel: 'Night Watch at Gate Sign',
              anchor: { x: cx - 2.6, z: cz + 12.2 },
              mode: 'station',
              wanderRadius: 1.0,
              facingYaw: 0,
            },
          ],
        },
        this.assets,
      ),
    );

    addNpc(
      new GuardNPC(
        {
          id: 'npc-sera',
          name: 'Sera',
          title: 'Square Patrol Guard',
          spawn: { x: cx + 5.8, z: cz - 5.8 },
          greetings: {
            morning: 'Making the morning rounds around Oakhollow Square.',
            midday: 'Market stalls are bustling today. Stay hydrated at the well!',
            evening: 'Doing the twilight patrol past the bakery and apothecary.',
            night: 'Keeping a quiet eye on the square beneath the street lamps.',
          },
          choices: [
            {
              id: 'square',
              label: 'What happens in the square?',
              reply:
                'Merchants open their awnings each morning, villagers gather near the well, and farmers bring fresh crops up from the east lane.',
              nextState: 'continue',
            },
            {
              id: 'bye',
              label: 'Thanks, Sera.',
              reply: 'Walk safe, explorer.',
              nextState: 'close',
            },
          ],
          schedule: [
            {
              period: 'morning',
              activityLabel: 'Patrolling Village Square',
              anchor: { x: cx, z: cz },
              mode: 'patrol',
              wanderRadius: 2.0,
              waypoints: [
                { x: cx - 6.2, z: cz - 6.2 },
                { x: cx + 6.2, z: cz - 6.2 },
                { x: cx + 6.2, z: cz + 6.2 },
                { x: cx - 6.2, z: cz + 6.2 },
              ],
            },
            {
              period: 'midday',
              activityLabel: 'Patrolling Market Fronts',
              anchor: { x: cx, z: cz - 6.0 },
              mode: 'patrol',
              wanderRadius: 2.0,
              waypoints: [
                { x: cx - 8.2, z: cz - 7.8 },
                { x: cx + 8.2, z: cz - 7.8 },
                { x: cx + 6.2, z: cz + 4.8 },
                { x: cx - 6.2, z: cz + 4.8 },
              ],
            },
            {
              period: 'evening',
              activityLabel: 'Patrolling Village Square',
              anchor: { x: cx, z: cz },
              mode: 'patrol',
              wanderRadius: 2.0,
              waypoints: [
                { x: cx - 6.2, z: cz - 6.2 },
                { x: cx + 6.2, z: cz - 6.2 },
                { x: cx + 6.2, z: cz + 6.2 },
                { x: cx - 6.2, z: cz + 6.2 },
              ],
            },
            {
              period: 'night',
              activityLabel: 'Night Patrol in Square',
              anchor: { x: cx, z: cz },
              mode: 'patrol',
              wanderRadius: 2.0,
              waypoints: [
                { x: cx - 5.0, z: cz - 5.0 },
                { x: cx + 5.0, z: cz - 5.0 },
                { x: cx + 5.0, z: cz + 5.0 },
                { x: cx - 5.0, z: cz + 5.0 },
              ],
            },
          ],
        },
        this.assets,
      ),
    );

    // 5. Oakhollow Blacksmith, Hunter, Woodcutter, Elder
    const forgePos = oakhollowRecord?.forgePos ?? new THREE.Vector3(cx + 19.5, 0, cz - 14);
    addNpc(
      new BlacksmithNPC(
        {
          id: 'npc-doran',
          name: 'Doran',
          title: 'Oakhollow Blacksmith',
          ...this.buildHomeProps(h(1)),
          workplaceId: 'oakhollow-forge',
          workplacePos: { x: forgePos.x, z: forgePos.z },
          spawn: { x: forgePos.x, z: forgePos.z + 2.2 },
          greetings: {
            morning: 'Coals are glowing bright! Bring iron ore and wood if you need fine steel or blade repairs.',
            midday: 'Nothing sings quite like hammer on anvil. Need your blade sharpened?',
            evening: 'Quenching the tongs for the evening. Stay sturdy on the road!',
            night: 'Time to bank the forge and rest indoors.',
          },
          choices: [
            {
              id: 'craft',
              label: 'What weapons can I forge?',
              reply: 'Open your Backpack & Crafting tab (Tab) anytime to forge Iron Swords, Steel Swords, Spears, and Battle Axes.',
              nextState: 'continue',
            },
            {
              id: 'bye',
              label: 'Keep the forge burning, Doran.',
              reply: 'Strike true, traveler!',
              nextState: 'close',
            },
          ],
          schedule: [
            { period: 'morning', activityLabel: 'Stoking the Forge', anchor: { x: forgePos.x, z: forgePos.z + 2.0 }, mode: 'work', wanderRadius: 2.4 },
            { period: 'midday', activityLabel: 'Forging Weapons', anchor: { x: forgePos.x, z: forgePos.z + 2.0 }, mode: 'work', wanderRadius: 2.2 },
            { period: 'evening', activityLabel: 'Walking to Cottage', anchor: { x: cx + 11.5, z: cz - 6.8 }, mode: 'station', wanderRadius: 1.5 },
            { period: 'night', activityLabel: 'Sleeping Indoors', anchor: { x: cx + 11.5, z: cz - 6.8 }, mode: 'sleep', wanderRadius: 1.0 },
          ],
        },
        this.assets,
      ),
    );

    addNpc(
      new HunterNPC(
        {
          id: 'npc-finnian',
          name: 'Finnian',
          title: 'Valley Hunter',
          ...this.buildHomeProps(h(2)),
          workplaceId: 'oakhollow-forest-edge',
          spawn: { x: cx - 22.0, z: cz + 14.0 },
          greetings: {
            morning: 'Tracking fresh game tracks along the western tree line.',
            midday: 'Peaceful herds graze calmly—draw a bow or spear only when hunting for leather and meat.',
            evening: 'Heading back toward Oakhollow before dark.',
            night: 'Off to sleep inside my cottage.',
          },
          choices: [
            {
              id: 'hunt',
              label: 'How do I gather leather and meat?',
              reply: 'Wild deer, rabbits, sheep, and cows roam the plains and woods. Hunt responsibly and loot their hide or leather.',
              nextState: 'continue',
            },
            {
              id: 'bye',
              label: 'Happy hunting, Finnian.',
              reply: 'Quiet steps, friend.',
              nextState: 'close',
            },
          ],
          schedule: [
            { period: 'morning', activityLabel: 'Scouting Forest Edge', anchor: { x: cx - 24, z: cz + 14 }, mode: 'wander', wanderRadius: 6.5 },
            { period: 'midday', activityLabel: 'Checking Traps & Pelts', anchor: { x: cx - 20, z: cz + 10 }, mode: 'work', wanderRadius: 4.5 },
            { period: 'evening', activityLabel: 'Returning Home', anchor: { x: cx - 10, z: cz + 14 }, mode: 'station', wanderRadius: 1.5 },
            { period: 'night', activityLabel: 'Sleeping Indoors', anchor: { x: cx - 8.4, z: cz + 13.5 }, mode: 'sleep', wanderRadius: 1.0 },
          ],
        },
        this.assets,
      ),
    );

    addNpc(
      new WoodcutterNPC(
        {
          id: 'npc-corvin',
          name: 'Corvin',
          title: 'Oakhollow Woodcutter',
          ...this.buildHomeProps(h(3)),
          workplaceId: 'oakhollow-timber',
          spawn: { x: cx + 11.5, z: cz + 19.5 },
          greetings: {
            morning: 'Chop your own firewood from woodland harvest trees—ten logs and five fiber build a camp bed!',
            midday: 'Hauling cut oak timber back toward the village lanes.',
            evening: 'Stacking logs before twilight.',
            night: 'Turning in for sleep indoors.',
          },
          choices: [
            {
              id: 'wood',
              label: 'Where can I harvest wood?',
              reply: 'Look for timber trees and fallen branches near clearings and press Interact (E) to harvest Wood.',
              nextState: 'continue',
            },
            {
              id: 'bye',
              label: 'See you, Corvin.',
              reply: 'Swing clean!',
              nextState: 'close',
            },
          ],
          schedule: [
            { period: 'morning', activityLabel: 'Cutting Timber', anchor: { x: cx + 15, z: cz + 24 }, mode: 'work', wanderRadius: 4.0 },
            { period: 'midday', activityLabel: 'Stacking Lumber', anchor: { x: cx + 10, z: cz + 12 }, mode: 'work', wanderRadius: 3.0 },
            { period: 'evening', activityLabel: 'Returning to Porch', anchor: { x: cx + 8.6, z: cz + 13.5 }, mode: 'station', wanderRadius: 1.5 },
            { period: 'night', activityLabel: 'Sleeping Indoors', anchor: { x: cx + 8.6, z: cz + 13.5 }, mode: 'sleep', wanderRadius: 1.0 },
          ],
        },
        this.assets,
      ),
    );

    addNpc(
      new ElderNPC(
        {
          id: 'npc-thorne',
          name: 'Elder Thorne',
          title: 'Oakhollow Village Elder',
          ...this.buildHomeProps(h(4)),
          workplaceId: 'oakhollow-plaza',
          spawn: { x: cx + 1.5, z: cz - 4.2 },
          greetings: {
            morning: 'Seven settlements dot these lands now. May the sun warm your journey!',
            midday: 'Check your map for Pinehaven, Greenfields, Cragwatch, Riverford, Windmere, and Grandcross.',
            evening: 'When night settles, rest in any bed until dawn.',
            night: 'Time for old bones to sleep indoors.',
          },
          choices: [
            {
              id: 'realm',
              label: 'Tell me about the other villages.',
              reply: 'Greenfields feeds the south, Pinehaven hews timber in the west woods, Cragwatch mines iron north, and Grandcross trades across the east.',
              nextState: 'continue',
            },
            {
              id: 'bye',
              label: 'Thank you, Elder Thorne.',
              reply: 'Walk in wisdom!',
              nextState: 'close',
            },
          ],
          schedule: [
            { period: 'morning', activityLabel: 'Blessing the Square', anchor: { x: cx, z: cz - 3.5 }, mode: 'wander', wanderRadius: 3.5 },
            { period: 'midday', activityLabel: 'Advising Travelers', anchor: { x: cx + 2, z: cz - 1.5 }, mode: 'station', wanderRadius: 1.5 },
            { period: 'evening', activityLabel: 'Walking Home', anchor: { x: cx - 18, z: cz - 14 }, mode: 'station', wanderRadius: 1.5 },
            { period: 'night', activityLabel: 'Sleeping Indoors', anchor: { x: cx - 18, z: cz - 14 }, mode: 'sleep', wanderRadius: 1.0 },
          ],
        },
        this.assets,
      ),
    );

    // Assign home/bed properties to Clara, Toby, Maren, Bram, Lyra, Garrick if available
    const assignHouseToNpc = (npcId: string, houseIdx: number) => {
      const target = this.npcs.find((n) => n.id === npcId);
      const house = h(houseIdx);
      if (target && house) {
        (target as { homeId?: string }).homeId = house.id;
        (target as { bedId?: string }).bedId = house.bedId;
        (target as { homeEntryPos?: { x: number; z: number } }).homeEntryPos = {
          x: house.doorEntryPos.x,
          z: house.doorEntryPos.z,
        };
        (target as { homeThresholdPos?: { x: number; z: number } }).homeThresholdPos = {
          x: house.doorThresholdPos.x,
          z: house.doorThresholdPos.z,
        };
        (target as { bedPos?: { x: number; y: number; z: number; yaw?: number } }).bedPos = {
          x: house.bedPos.x,
          y: house.bedPos.y,
          z: house.bedPos.z,
          yaw: house.bedYaw,
        };
      }
    };
    assignHouseToNpc('npc-clara', 1);
    assignHouseToNpc('npc-toby', 2);
    assignHouseToNpc('npc-maren', 3);
    assignHouseToNpc('npc-bram', 4);
    assignHouseToNpc('npc-lyra', 0);
  }

  private spawnRegionalVillageNpcs(village: VillageSiteRecord): void {
    const cx = village.centerX;
    const cz = village.centerZ;
    const h = (idx: number) =>
      village.houses.length > 0
        ? village.houses[idx % village.houses.length]
        : undefined;

    const addRegionalNpc = (cfg: NpcConfig) => {
      const npc = createNpcByRole(cfg, this.assets);
      npc.setLanguage(this.language);
      this.npcs.push(npc);
      this.villageNpcIds.add(npc.id);
      this.npcGroup.add(npc.rig.root);
      this.positionCache.push({ id: npc.id, x: npc.position.x, z: npc.position.z });
    };

    interface RegionalRosterEntry {
      role: NpcRole;
      name: string;
      nameAr: string;
      title: string;
      titleAr: string;
    }

    const roleRosterByKind: Record<string, RegionalRosterEntry[]> = {
      forest: [
        { role: 'woodcutter', name: 'Bramwell', nameAr: 'برامويل', title: 'Master Woodcutter', titleAr: 'شيخ الحطّابين' },
        { role: 'hunter', name: 'Kaelen', nameAr: 'كيلين', title: 'Pinehaven Hunter', titleAr: 'صيّاد ملاذ الصنوبر' },
        { role: 'healer', name: 'Sylvia', nameAr: 'سيلفيا', title: 'Forest Healer', titleAr: 'معالجة الغابة' },
        { role: 'guard', name: 'Orin', nameAr: 'أورين', title: 'Pinehaven Warden', titleAr: 'حارس ملاذ الصنوبر' },
      ],
      farming: [
        { role: 'farmer', name: 'Harlan', nameAr: 'هارلان', title: 'Head Farmer', titleAr: 'كبير المزارعين' },
        { role: 'farmer', name: 'Pippa', nameAr: 'بيبا', title: 'Field Tender', titleAr: 'راعية الحقول' },
        { role: 'blacksmith', name: 'Gareth', nameAr: 'غاريث', title: 'Plowsmith', titleAr: 'حداد المحاريث' },
        { role: 'carpenter', name: 'Lukas', nameAr: 'لوكاس', title: 'Barn Carpenter', titleAr: 'نجّار الحظائر' },
        { role: 'guard', name: 'Talia', nameAr: 'تاليا', title: 'Greenfields Watch', titleAr: 'حارسة المروج الخضراء' },
      ],
      mountain: [
        { role: 'miner', name: 'Dain', nameAr: 'داين', title: 'Ore Prospector', titleAr: 'منقّب المعادن' },
        { role: 'blacksmith', name: 'Varek', nameAr: 'فاريك', title: 'Cragwatch Forger', titleAr: 'حدّاد مرصد الجرف' },
        { role: 'guard', name: 'Helga', nameAr: 'هلغا', title: 'Ridge Sentinel', titleAr: 'حارسة القمم' },
        { role: 'elder', name: 'Elder Bjorne', nameAr: 'الشيخ بيورن', title: 'Highland Elder', titleAr: 'شيخ المرتفعات' },
      ],
      river: [
        { role: 'fisherman', name: 'Marlin', nameAr: 'مارلين', title: 'River Angler', titleAr: 'صيّاد النهر' },
        { role: 'merchant', name: 'Soren', nameAr: 'سورين', title: 'Dockside Merchant', titleAr: 'تاجر الرصيف' },
        { role: 'innkeeper', name: 'Nessa', nameAr: 'نيسا', title: 'Riverside Innkeeper', titleAr: 'صاحبة نزل النهر' },
        { role: 'guard', name: 'Caleb', nameAr: 'كالب', title: 'Bridge Warden', titleAr: 'حارس الجسر' },
      ],
      plains: [
        { role: 'farmer', name: 'Wren', nameAr: 'رين', title: 'Meadow Shepherd', titleAr: 'راعي المروج' },
        { role: 'healer', name: 'Iris', nameAr: 'أيريس', title: 'Village Healer', titleAr: 'معالجة القرية' },
        { role: 'merchant', name: 'Jorah', nameAr: 'جوراه', title: 'Windmere Peddler', titleAr: 'تاجر بحيرة الريح' },
        { role: 'carpenter', name: 'Owen', nameAr: 'أوين', title: 'Windmere Carpenter', titleAr: 'نجّار بحيرة الريح' },
      ],
      trading: [
        { role: 'merchant', name: 'Aurelia', nameAr: 'أوريليا', title: 'Grandcross Silk Merchant', titleAr: 'تاجرة حرير المفترق' },
        { role: 'traveling_merchant', name: 'Rashid', nameAr: 'رشيد', title: 'Caravan Quartermaster', titleAr: 'قائد القوافل' },
        { role: 'blacksmith', name: 'Borin', nameAr: 'بورين', title: 'Grandcross Master Smith', titleAr: 'كبير حدّادي المفترق' },
        { role: 'innkeeper', name: 'Marta', nameAr: 'مارتا', title: 'Golden Cross Innkeeper', titleAr: 'صاحبة النزل الذهبي' },
        { role: 'elder', name: 'Elder Alaric', nameAr: 'الشيخ ألاريك', title: 'Grandcross Magistrate', titleAr: 'حاكم المفترق الكبير' },
        { role: 'guard', name: 'Vance', nameAr: 'فانس', title: 'Crossroads Captain', titleAr: 'قائد حرس المفترق' },
      ],
      desert: [
        { role: 'merchant', name: 'Zahir', nameAr: 'زاهر', title: 'Oasis Spice Trader', titleAr: 'تاجر توابل الواحة' },
        { role: 'traveling_merchant', name: 'Layla', nameAr: 'ليلى', title: 'Caravan Outfitter', titleAr: 'مجهّزة القوافل' },
        { role: 'guard', name: 'Faris', nameAr: 'فارس', title: 'Dune Sentinel', titleAr: 'حارس الكثبان' },
        { role: 'elder', name: 'Elder Hakim', nameAr: 'الشيخ حكيم', title: 'Oasis Keeper', titleAr: 'شيخ الواحة' },
      ],
      valley: [
        { role: 'farmer', name: 'Rory', nameAr: 'روري', title: 'Glen Cultivator', titleAr: 'مزارع الوادي' },
        { role: 'woodcutter', name: 'Halvor', nameAr: 'هالفور', title: 'Valley Forester', titleAr: 'حطّاب الوادي' },
        { role: 'healer', name: 'Faye', nameAr: 'فاي', title: 'Valley Herbalist', titleAr: 'عشّابة الوادي' },
        { role: 'guard', name: 'Kieran', nameAr: 'كيران', title: 'Glenwatch Patrol', titleAr: 'حارس مرصد الوادي' },
      ],
    };

    const villageNameAr = getLocalizedVillageName(village.id, village.name, 'ar');
    const safeWaypoints = village.guardWaypoints
      .map((w) =>
        isValidNPCSpawnLocation(w.x, w.z)
          ? { x: w.x, z: w.z }
          : findNearestValidLand(w.x, w.z, 3.0, 0.34, 48),
      )
      .map((p) => ({ x: p.x, z: p.z }));

    const roster = roleRosterByKind[village.kind] ?? roleRosterByKind.plains;
    roster.forEach((entry, idx) => {
      const home = h(idx);
      const isNightWorker = entry.role === 'guard';
      let rawX = cx + ((idx % 3) - 1) * 5.5;
      let rawZ = cz + (idx % 2 === 0 ? -4.5 : 4.5);

      if (entry.role === 'farmer') {
        rawX = village.farmCenter.x;
        rawZ = village.farmCenter.z;
      } else if (entry.role === 'blacksmith') {
        rawX = village.forgePos.x;
        rawZ = village.forgePos.z;
      } else if (entry.role === 'merchant' || entry.role === 'traveling_merchant') {
        rawX = village.marketPos.x + (idx % 2 === 0 ? -3 : 3);
        rawZ = village.marketPos.z;
      }

      const validWork = isValidNPCSpawnLocation(rawX, rawZ)
        ? { x: rawX, z: rawZ }
        : findNearestValidLand(rawX, rawZ, 3.5, 0.32, 60);
      const workX = validWork.x;
      const workZ = validWork.z;

      addRegionalNpc({
        id: `npc-${village.id}-${entry.role}-${idx}`,
        name: entry.name,
        nameAr: entry.nameAr,
        role: entry.role,
        title: entry.title,
        titleAr: entry.titleAr,
        location: village.name,
        locationAr: villageNameAr,
        ...(isNightWorker ? {} : this.buildHomeProps(home)),
        workplaceId: `${village.id}-${entry.role}`,
        workplacePos: { x: workX, z: workZ },
        spawn: { x: workX, z: workZ },
        greetings: {
          morning:
            entry.role === 'guard'
              ? 'Welcome, traveler. The road ahead is dangerous.'
              : `Good morning from ${village.name}! Busy day ahead at my post.`,
          midday: `Welcome to ${village.name}, traveler. Make yourself at home.`,
          evening: `The sun dips low over ${village.name}. Stay warm tonight.`,
          night: isNightWorker
            ? `Keeping ${village.name} safe through the night.`
            : `Heading indoors to sleep until morning.`,
        },
        greetingsAr: {
          morning:
            entry.role === 'guard'
              ? 'مرحبًا أيها المسافر. الطريق أمامك خطير.'
              : `صباح الخير من ${villageNameAr}! أمامي يوم حافل في عملي.`,
          midday: `مرحبًا بك في ${villageNameAr} أيها المسافر. اعتبر نفسك في بيتك.`,
          evening: `تميل الشمس للغروب فوق ${villageNameAr}. ابقَ دافئًا الليلة.`,
          night: isNightWorker
            ? `أحافظ على أمان ${villageNameAr} طوال الليل.`
            : `أتوجه إلى الداخل للنوم حتى الصباح.`,
        },
        choices: [
          {
            id: 'town',
            label: `Tell me about ${village.name}.`,
            reply: `${village.name} welcomes travelers, crafters, and traders alike. Browse our market or rest at a hearth anytime.`,
            nextState: 'continue',
          },
          {
            id: 'bye',
            label: 'Safe days ahead.',
            reply: 'May your journey prosper!',
            nextState: 'close',
          },
        ],
        choicesAr: [
          {
            id: 'town',
            label: `أخبرني عن ${villageNameAr}.`,
            reply: `ترحب ${villageNameAr} بالمسافرين والحرفيين والتجار على حد سواء. تفقد سوقنا أو استرح وقتما تشاء.`,
            nextState: 'continue',
          },
          {
            id: 'bye',
            label: 'أيامًا آمنة لك.',
            reply: 'تمنياتي لك برحلة موفقة!',
            nextState: 'close',
          },
        ],
        schedule: [
          {
            period: 'morning',
            activityLabel: `Working in ${village.name}`,
            anchor: { x: workX, z: workZ },
            mode: entry.role === 'guard' ? 'patrol' : 'work',
            wanderRadius: 4.5,
            waypoints: safeWaypoints,
          },
          {
            period: 'midday',
            activityLabel: `Tending ${village.name} Duties`,
            anchor: { x: workX, z: workZ },
            mode: entry.role === 'guard' ? 'patrol' : 'work',
            wanderRadius: 5.5,
            waypoints: safeWaypoints,
          },
          {
            period: 'evening',
            activityLabel: isNightWorker ? 'Evening Patrol' : 'Heading Toward Home',
            anchor: home ? { x: home.doorEntryPos.x, z: home.doorEntryPos.z } : { x: cx, z: cz },
            mode: isNightWorker ? 'patrol' : 'wander',
            wanderRadius: 2.8,
            waypoints: safeWaypoints,
          },
          {
            period: 'night',
            activityLabel: isNightWorker ? 'Night Watch' : 'Sleeping Indoors',
            anchor: home ? { x: home.doorEntryPos.x, z: home.doorEntryPos.z } : { x: cx, z: cz },
            mode: isNightWorker ? 'patrol' : 'sleep',
            wanderRadius: 1.5,
            waypoints: safeWaypoints,
          },
        ],
        routineLabelsAr: {
          morning: `يعمل في ${villageNameAr}`,
          midday: `يباشر مهام ${villageNameAr}`,
          evening: isNightWorker ? 'دورية مسائية' : 'يتجه نحو المنزل',
          night: isNightWorker ? 'حراسة ليلية' : 'ينام في المنزل',
        },
      });
    });
  }

  private spawnProceduralVillageNpcs(village: VillageSiteRecord): void {
    const cx = village.centerX;
    const cz = village.centerZ;
    const houses = village.houses ?? [];
    const h = (idx: number) =>
      houses.length > 0 ? houses[idx % houses.length] : undefined;

    let hash = 2166136261;
    for (let i = 0; i < village.id.length; i++) {
      hash ^= village.id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const rand = seededRandom((hash ^ Math.round(cx * 31) ^ Math.round(cz * 17)) >>> 0);

    const firstNames: Array<{ en: string; ar: string }> = [
      { en: 'Alden', ar: 'ألدن' },
      { en: 'Bryn', ar: 'برين' },
      { en: 'Cora', ar: 'كورا' },
      { en: 'Dorian', ar: 'دوريان' },
      { en: 'Elara', ar: 'إيلارا' },
      { en: 'Fenn', ar: 'فين' },
      { en: 'Gideon', ar: 'جيديون' },
      { en: 'Hana', ar: 'هناء' },
      { en: 'Idris', ar: 'إدريس' },
      { en: 'Joss', ar: 'جوس' },
      { en: 'Kael', ar: 'كايل' },
      { en: 'Lina', ar: 'لينا' },
      { en: 'Merek', ar: 'ميريك' },
      { en: 'Nadia', ar: 'نادية' },
      { en: 'Orson', ar: 'أورسون' },
      { en: 'Petra', ar: 'بترا' },
      { en: 'Quentin', ar: 'كوينتن' },
      { en: 'Rhea', ar: 'ريا' },
      { en: 'Sami', ar: 'سامي' },
      { en: 'Tamsin', ar: 'تامسين' },
      { en: 'Umar', ar: 'عمر' },
      { en: 'Vera', ar: 'فيرا' },
      { en: 'Wyatt', ar: 'وايت' },
      { en: 'Yara', ar: 'يارا' },
      { en: 'Zane', ar: 'زين' },
    ];

    const roleTitles: Record<NpcRole, { en: string; ar: string }> = {
      elder: { en: 'Village Leader', ar: 'زعيم القرية' },
      guard: { en: 'Village Guard', ar: 'حارس القرية' },
      farmer: { en: 'Field Cultivator', ar: 'مزارع القرية' },
      blacksmith: { en: 'Village Blacksmith', ar: 'حدّاد القرية' },
      carpenter: { en: 'Master Carpenter', ar: 'نجّار القرية' },
      woodcutter: { en: 'Forester & Sawyer', ar: 'حطّاب القرية' },
      miner: { en: 'Ore Prospector', ar: 'منقّب المعادن' },
      hunter: { en: 'Scout & Hunter', ar: 'صيّاد القرية' },
      fisherman: { en: 'Shore Angler', ar: 'صيّاد الساحل' },
      healer: { en: 'Village Herbalist', ar: 'معالج القرية' },
      innkeeper: { en: 'Hearth Keeper', ar: 'صاحب النزل' },
      merchant: { en: 'Village Trader', ar: 'تاجر القرية' },
      traveling_merchant: { en: 'Caravan Peddler', ar: 'تاجر القوافل' },
      villager: { en: 'Townsfolk', ar: 'من أهل القرية' },
    };

    const villageNameAr = getLocalizedVillageName(village.id, village.name, 'ar');
    const safeWaypoints = village.guardWaypoints
      .map((w) =>
        isValidNPCSpawnLocation(w.x, w.z)
          ? { x: w.x, z: w.z }
          : findNearestValidLand(w.x, w.z, 3.0, 0.34, 48),
      )
      .map((p) => ({ x: p.x, z: p.z }));

    const plan = village.populationPlan ?? {
      guardCount: 2,
      workerRoles: ['farmer', 'carpenter', 'woodcutter'] as NpcRole[],
      hasTrader: true,
      traderIsTraveling: false,
      villagerCount: 6,
      questCount: 4,
    };

    const nameCursorStart = Math.floor(rand() * firstNames.length);
    let nameIdx = 0;
    const nextName = () => {
      const pair = firstNames[(nameCursorStart + nameIdx * 3) % firstNames.length];
      nameIdx++;
      return pair;
    };

    const spawnEntries: Array<{
      idSuffix: string;
      role: NpcRole;
      name: string;
      nameAr: string;
      title: string;
      titleAr: string;
      rawX: number;
      rawZ: number;
      mode: 'patrol' | 'work' | 'wander' | 'station';
      wanderRadius: number;
      isGuard: boolean;
      houseIdx: number;
    }> = [];

    // 1. Village Leader (Elder)
    const leaderName = nextName();
    spawnEntries.push({
      idSuffix: 'elder-0',
      role: 'elder',
      name: `Elder ${leaderName.en}`,
      nameAr: `الشيخ ${leaderName.ar}`,
      title: roleTitles.elder.en,
      titleAr: roleTitles.elder.ar,
      rawX: cx + 2.8,
      rawZ: cz + 2.2,
      mode: 'wander',
      wanderRadius: 5.5,
      isGuard: false,
      houseIdx: 0,
    });

    // 2. Guards (minimum 2 per village)
    const guardCount = Math.max(2, plan.guardCount);
    for (let g = 0; g < guardCount; g++) {
      const gName = nextName();
      const wp = safeWaypoints[g % Math.max(1, safeWaypoints.length)] ?? { x: cx + (g === 0 ? 7 : -7), z: cz };
      spawnEntries.push({
        idSuffix: `guard-${g}`,
        role: 'guard',
        name: `${gName.en}`,
        nameAr: `${gName.ar}`,
        title: roleTitles.guard.en,
        titleAr: roleTitles.guard.ar,
        rawX: wp.x,
        rawZ: wp.z,
        mode: 'patrol',
        wanderRadius: 4.5,
        isGuard: true,
        houseIdx: g + 1,
      });
    }

    // 3. Biome Workers (up to 3)
    const workerRoles = plan.workerRoles.length > 0
      ? plan.workerRoles
      : (['farmer', 'carpenter', 'woodcutter'] as NpcRole[]);
    for (let w = 0; w < workerRoles.length; w++) {
      const role = workerRoles[w];
      const wName = nextName();
      let wx = cx + Math.cos(w * 2.1) * 7.5;
      let wz = cz + Math.sin(w * 2.1) * 7.5;
      if (role === 'farmer') {
        wx = village.farmCenter.x;
        wz = village.farmCenter.z;
      } else if (role === 'blacksmith') {
        wx = village.forgePos.x;
        wz = village.forgePos.z;
      } else if (
        (role === 'woodcutter' || role === 'miner' || role === 'fisherman' || role === 'healer') &&
        village.resourceYardPos
      ) {
        wx = village.resourceYardPos.x + (w - 1) * 2.4;
        wz = village.resourceYardPos.z + 2.2;
      }
      const rt = roleTitles[role] ?? roleTitles.villager;
      spawnEntries.push({
        idSuffix: `worker-${role}-${w}`,
        role,
        name: wName.en,
        nameAr: wName.ar,
        title: rt.en,
        titleAr: rt.ar,
        rawX: wx,
        rawZ: wz,
        mode: 'work',
        wanderRadius: 5.5,
        isGuard: false,
        houseIdx: w + 1,
      });
    }

    // 4. Optional Trader
    if (plan.hasTrader) {
      const tRole: NpcRole = plan.traderIsTraveling ? 'traveling_merchant' : 'merchant';
      const tName = nextName();
      const rt = roleTitles[tRole];
      spawnEntries.push({
        idSuffix: `trader-0`,
        role: tRole,
        name: tName.en,
        nameAr: tName.ar,
        title: rt.en,
        titleAr: rt.ar,
        rawX: village.marketPos.x + 1.8,
        rawZ: village.marketPos.z + 1.5,
        mode: 'station',
        wanderRadius: 3.0,
        isGuard: false,
        houseIdx: 0,
      });
    }

    // 5. Villagers (5-10 residents)
    const villagerCount = Math.max(5, Math.min(10, plan.villagerCount));
    for (let vIdx = 0; vIdx < villagerCount; vIdx++) {
      const vName = nextName();
      const angle = (vIdx / villagerCount) * Math.PI * 2 + rand() * 0.4;
      const rad = 5.5 + rand() * 8.0;
      spawnEntries.push({
        idSuffix: `villager-${vIdx}`,
        role: 'villager',
        name: vName.en,
        nameAr: vName.ar,
        title: roleTitles.villager.en,
        titleAr: roleTitles.villager.ar,
        rawX: cx + Math.cos(angle) * rad,
        rawZ: cz + Math.sin(angle) * rad,
        mode: 'wander',
        wanderRadius: 9.0,
        isGuard: false,
        houseIdx: vIdx,
      });
    }

    for (const entry of spawnEntries) {
      const validPos = isValidNPCSpawnLocation(entry.rawX, entry.rawZ)
        ? { x: entry.rawX, z: entry.rawZ }
        : findNearestValidLand(entry.rawX, entry.rawZ, 3.5, 0.32, 60);
      const sx = validPos.x;
      const sz = validPos.z;
      const home = h(entry.houseIdx);

      const cfg: NpcConfig = {
        id: `npc-${village.id}-${entry.idSuffix}`,
        name: entry.name,
        nameAr: entry.nameAr,
        role: entry.role,
        title: entry.title,
        titleAr: entry.titleAr,
        location: village.name,
        locationAr: villageNameAr,
        ...(entry.isGuard ? {} : this.buildHomeProps(home)),
        workplaceId: `${village.id}-${entry.idSuffix}`,
        workplacePos: { x: sx, z: sz },
        spawn: { x: sx, z: sz },
        greetings: {
          morning: entry.isGuard
            ? `Hail, traveler. We keep watch over ${village.name}.`
            : `Good morning from ${village.name}! May your pack stay heavy with supplies.`,
          midday: `Welcome to ${village.name}, traveler. Make yourself at home.`,
          evening: `The lanterns burn warm across ${village.name} tonight.`,
          night: entry.isGuard
            ? `Standing watch over ${village.name} until sunrise.`
            : `Heading indoors to sleep until morning.`,
        },
        greetingsAr: {
          morning: entry.isGuard
            ? `أهلاً أيها المسافر. نحرس طرقات ${villageNameAr} بعين يقظة.`
            : `صباح الخير من ${villageNameAr}! أتمنى لك يوماً مليئاً بالخيرات.`,
          midday: `مرحباً بك في ${villageNameAr} أيها المسافر. المكان بيتك.`,
          evening: `تتوهج الفوانيس في أرجاء ${villageNameAr} هذا المساء.`,
          night: entry.isGuard
            ? `أواصل الحراسة لحماية ${villageNameAr} حتى الفجر.`
            : `أتوجه إلى المنزل للنوم حتى الصباح.`,
        },
        choices: [
          {
            id: 'town',
            label: `Tell me about ${village.name}.`,
            reply: `${village.name} thrives thanks to hard work, local crafters, and vigilant guards.`,
            nextState: 'continue',
          },
          {
            id: 'bye',
            label: 'Safe days ahead.',
            reply: 'Walk steady on the trails!',
            nextState: 'close',
          },
        ],
        choicesAr: [
          {
            id: 'town',
            label: `أخبرني عن ${villageNameAr}.`,
            reply: `تزدهر ${villageNameAr} بعمل أهلها الدؤوب وحراسها اليقظين.`,
            nextState: 'continue',
          },
          {
            id: 'bye',
            label: 'أياماً آمنة لك.',
            reply: 'رافقتك السلامة في دروبك!',
            nextState: 'close',
          },
        ],
        schedule: [
          {
            period: 'morning',
            activityLabel: entry.isGuard ? `Patrolling ${village.name}` : `Working in ${village.name}`,
            anchor: { x: sx, z: sz },
            mode: entry.mode,
            wanderRadius: entry.wanderRadius,
            waypoints: safeWaypoints,
          },
          {
            period: 'midday',
            activityLabel: entry.isGuard ? `Guarding ${village.name}` : `Busy in ${village.name}`,
            anchor: { x: sx, z: sz },
            mode: entry.mode,
            wanderRadius: entry.wanderRadius + 1,
            waypoints: safeWaypoints,
          },
          {
            period: 'evening',
            activityLabel: entry.isGuard ? 'Evening Patrol' : 'Heading Home',
            anchor: home ? { x: home.doorEntryPos.x, z: home.doorEntryPos.z } : { x: cx, z: cz },
            mode: entry.isGuard ? 'patrol' : 'wander',
            wanderRadius: 3.2,
            waypoints: safeWaypoints,
          },
          {
            period: 'night',
            activityLabel: entry.isGuard ? 'Night Watch' : 'Sleeping Indoors',
            anchor: home ? { x: home.doorEntryPos.x, z: home.doorEntryPos.z } : { x: cx, z: cz },
            mode: entry.isGuard ? 'patrol' : 'sleep',
            wanderRadius: 1.5,
            waypoints: safeWaypoints,
          },
        ],
        routineLabelsAr: {
          morning: entry.isGuard ? `دورية في ${villageNameAr}` : `يعمل في ${villageNameAr}`,
          midday: entry.isGuard ? `يحرس ${villageNameAr}` : `ينشط في ${villageNameAr}`,
          evening: entry.isGuard ? 'دورية مسائية' : 'يتجه نحو المنزل',
          night: entry.isGuard ? 'حراسة ليلية' : 'ينام في المنزل',
        },
      };

      const npc = createNpcByRole(cfg, this.assets);
      npc.setLanguage(this.language);
      this.npcs.push(npc);
      this.villageNpcIds.add(npc.id);
      this.npcGroup.add(npc.rig.root);
    }
  }

  public getNearestInteractable(
    playerPos: THREE.Vector3,
  ): { npc: NPCBase; info: InteractableInfo; distSq: number } | null {
    let best: NPCBase | null = null;
    let bestDistSq = Infinity;

    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      if (npc.isDead) continue;
      const dx = playerPos.x - npc.position.x;
      const dz = playerPos.z - npc.position.z;
      const dSq = dx * dx + dz * dz;
      if (dSq <= npc.interactionRadius * npc.interactionRadius && dSq < bestDistSq) {
        bestDistSq = dSq;
        best = npc;
      }
    }

    if (!best) return null;
    return {
      npc: best,
      distSq: bestDistSq,
      info: {
        id: best.id,
        label: best.getLocalizedName(this.language),
        actionVerb: this.language === 'ar' ? 'تحدّث مع' : 'Talk to',
        kind: 'npc',
      },
    };
  }

  public engageForDialogue(
    npcId: string,
    playerPos: THREE.Vector3,
  ): DialogueNpcProfile | null {
    const npc = this.npcs.find((n) => n.id === npcId);
    if (!npc) return null;
    if (this.activeDialogueNpc && this.activeDialogueNpc !== npc) {
      this.activeDialogueNpc.endDialogue();
    }
    this.activeDialogueNpc = npc;
    npc.beginDialogue(playerPos);
    return npc.getDialogueProfile(this.language);
  }

  public startDialogue(npcId: string, playerPos: THREE.Vector3): NpcDialogueSession | null {
    const npc = this.npcs.find((n) => n.id === npcId);
    if (!npc) return null;
    if (this.activeDialogueNpc && this.activeDialogueNpc !== npc) {
      this.activeDialogueNpc.endDialogue();
    }
    this.activeDialogueNpc = npc;
    return npc.beginDialogue(playerPos);
  }

  public endDialogue(): void {
    if (this.activeDialogueNpc) {
      this.activeDialogueNpc.endDialogue();
      this.activeDialogueNpc = null;
    }
  }

  public setVillageActive(_active: boolean): void {
    // Visibility of Oakhollow and all regional villages is distance-culled dynamically in update().
  }

  public spawnChunkNpcs(
    chunkKey: string,
    cx: number,
    cz: number,
    chunkSeed: number,
    chunkSize: number,
    isVillageClearance: (x: number, z: number) => boolean,
  ): void {
    if (this.chunkNpcs.has(chunkKey)) return;
    if (cx === 0 && cz === 0) {
      this.chunkNpcs.set(chunkKey, []);
      return;
    }

    const rand = seededRandom((chunkSeed ^ 0x51f29a3b) >>> 0);
    if (rand() > 0.36) {
      this.chunkNpcs.set(chunkKey, []);
      return;
    }

    let spawnX = 0;
    let spawnZ = 0;
    let found = false;
    const halfSpan = chunkSize * 0.38;
    const centerX = cx * chunkSize;
    const centerZ = cz * chunkSize;

    for (let attempt = 0; attempt < 22; attempt++) {
      const wx = centerX + (rand() - 0.5) * 2 * halfSpan;
      const wz = centerZ + (rand() - 0.5) * 2 * halfSpan;
      if (Math.hypot(wx, wz - 4) < 58) continue;
      if (Math.hypot(wx, wz) > PLAYABLE_RADIUS - 32) continue;
      if (isVillageClearance(wx, wz)) continue;
      if (!isValidNPCSpawnLocation(wx, wz)) continue;
      const wy = groundHeightAt(wx, wz);
      if (wy > 38) continue;
      spawnX = wx;
      spawnZ = wz;
      found = true;
      break;
    }

    if (!found) {
      this.chunkNpcs.set(chunkKey, []);
      return;
    }

    const biome = getBiomeAt(spawnX, spawnZ);
    const config = this.buildChunkNpcConfig(chunkKey, spawnX, spawnZ, biome, rand, chunkSeed);

    const npc = createNpcByRole(config, this.assets);
    npc.setLanguage(this.language);
    npc.setNetworkRemoteControlled(this.networkRemoteControlled);

    this.npcs.push(npc);
    this.npcGroup.add(npc.rig.root);
    this.positionCache.push({
      id: npc.id,
      x: npc.position.x,
      z: npc.position.z,
    });
    this.chunkNpcs.set(chunkKey, [npc]);
  }

  public unloadChunkNpcs(chunkKey: string): void {
    const list = this.chunkNpcs.get(chunkKey);
    if (!list) return;

    if (list.length > 0) {
      for (let i = 0; i < list.length; i++) {
        const npc = list[i];
        if (this.activeDialogueNpc === npc) {
          this.activeDialogueNpc.endDialogue();
          this.activeDialogueNpc = null;
        }
        const idx = this.npcs.indexOf(npc);
        if (idx !== -1) {
          this.npcs.splice(idx, 1);
          this.positionCache.splice(idx, 1);
        }
        npc.dispose();
      }
    }
    this.chunkNpcs.delete(chunkKey);
  }

  private buildChunkNpcConfig(
    chunkKey: string,
    x: number,
    z: number,
    biome: string,
    rand: () => number,
    chunkSeed: number,
  ): Omit<NpcConfig, 'role'> & { role: NpcRole } {
    interface ArchetypePool {
      role: NpcRole;
      namesEn: string[];
      namesAr: string[];
      titleEn: string;
      titleAr: string;
      locEn: string;
      locAr: string;
      personaEn: string;
      personaAr: string;
      greetMorningEn: string;
      greetMorningAr: string;
      greetDayEn: string;
      greetDayAr: string;
      greetEveningEn: string;
      greetEveningAr: string;
      greetNightEn: string;
      greetNightAr: string;
      factEn: string;
      factAr: string;
    }

    const poolsByBiome: Record<string, ArchetypePool> = {
      Forest: {
        role: 'villager',
        namesEn: ['Sylvan', 'Briar', 'Elowen', 'Kael'],
        namesAr: ['سيلفان', 'براير', 'إلوين', 'كاييل'],
        titleEn: 'Woodland Herbalist',
        titleAr: 'عشّاب الغابة',
        locEn: 'Whispering Woods Trail',
        locAr: 'درب غابة الهمس',
        personaEn:
          'Gentle forest naturalist studying woodland ferns, pine canopies, and hidden deer glades.',
        personaAr:
          'باحث لطيف في طبيعة الغابة يدرس السراخس وأشجار الصنوبر وفسحات الغزلان.',
        greetMorningEn: 'The pine mist smells crisp this morning. Watch for golden herbs beneath the oaks!',
        greetMorningAr: 'ضباب الصنوبر منعش هذا الصباح. راقب الأعشاب الذهبية تحت أشجار البلوط!',
        greetDayEn: 'Dappled sunlight makes foraging much easier out on these mossy trails.',
        greetDayAr: 'أشعة الشمس المتسللة تجعل جمع الأعشاب أسهل في هذه الدروب المكسوة بالطحالب.',
        greetEveningEn: 'Evening owls will wake soon in the canopy. Keep your lantern handy!',
        greetEveningAr: 'ستستيقظ بوم المساء قريبًا بين الأغصان. أبقِ مصباحك جاهزًا!',
        greetNightEn: 'Staying near the clearing tonight—wolves prefer the deeper ridge.',
        greetNightAr: 'أبقى قرب الفسحة الليلة، فالذئاب تفضّل التلال الأعمق.',
        factEn:
          'These western groves feed clean water from Whispering Lake all the way down toward Oakhollow.',
        factAr:
          'هذه البساتين الغربية تغذّي المياه الصافية من البحيرة الهمّاسة نزولًا نحو قرية أوكهولو.',
      },
      Desert: {
        role: 'merchant',
        namesEn: ['Zayd', 'Samira', 'Tariq', 'Nadia'],
        namesAr: ['زيد', 'سميرة', 'طارق', 'نادية'],
        titleEn: 'Dune Caravaneer',
        titleAr: 'قافل الكثبان',
        locEn: 'Sunstone Desert Outskirts',
        locAr: 'أطراف صحراء حجر الشمس',
        personaEn:
          'Cheerful desert navigator who trades spices, desert glass, and sage wisdom about reading dunes and wind.',
        personaAr:
          'ملاح صحراوي بشوش يتاجر بالتوابل والزجاج الصحراوي ويقرأ الرياح والكثبان بمهارة.',
        greetMorningEn: 'Early morning is the coolest hour to cross the golden dunes!',
        greetMorningAr: 'الصباح الباكر هو ألطف وقت لعبور الكثبان الذهبية!',
        greetDayEn: 'Careful how fast you sprint across soft sand—save stamina for the ridges.',
        greetDayAr: 'انتبه لسرعة ركضك فوق الرمال الناعمة وادّخر طاقتك للتلال.',
        greetEveningEn: 'When the red sandstone glows amber, the desert breeze turns delightfully cool.',
        greetEveningAr: 'عندما يتوهج الحجر الرملي بلون العنبر، يصبح نسيم الصحراء عليلًا ورائعًا.',
        greetNightEn: 'Stars shine clearest above Sunstone Desert after dusk.',
        greetNightAr: 'تلمع النجوم بأصفى صورة فوق صحراء حجر الشمس بعد الغسق.',
        factEn:
          'Look for tall saguaro silhouettes and sandstone arches—they mark ancient caravan trails.',
        factAr:
          'تتبّع ظلال الصبّار وأقواس الحجر الرملي فهي علامات دروب القوافل القديمة.',
      },
      Mountains: {
        role: 'guard',
        namesEn: ['Torin', 'Freya', 'Ronan', 'Astrid'],
        namesAr: ['تورين', 'فريا', 'رونان', 'أستريد'],
        titleEn: 'Highland Scout',
        titleAr: 'كشّاف المرتفعات',
        locEn: 'Northern Mountain Ridge',
        locAr: 'سلسلة الجبال الشمالية',
        personaEn:
          'Steady, observant mountaineer keeping watch over snowy passes and rocky overlooks.',
        personaAr:
          'متسلق جبال هادئ ويقظ يراقب الممرات الثلجية والمطلات الصخرية.',
        greetMorningEn: 'Clear visibility across the valley today—you can spot Oakhollow from the ridge!',
        greetMorningAr: 'الرؤية صافية عبر الوادي اليوم؛ يمكنك رؤية أوكهولو من أعلى القمة!',
        greetDayEn: 'Watch steep scree on the higher slopes and keep your footing steady.',
        greetDayAr: 'احذر الحصى المنحدرة على السفوح العالية وثبّت خطواتك.',
        greetEveningEn: 'Mountain temperatures drop quickly once the sun dips behind the peaks.',
        greetEveningAr: 'تنخفض حرارة الجبل سريعًا ما إن تغرب الشمس خلف القمم.',
        greetNightEn: 'The snowfields glow silver under moonlight—tread carefully.',
        greetNightAr: 'تتوهج حقول الثلج بالفضي تحت ضوء القمر؛ سر بحذر.',
        factEn:
          'Higher peaks hold alpine wildlife, wind-carved granite outcrops, and panoramic valley vistas.',
        factAr:
          'تضم القمم العالية حياة برية جبلية وصخورًا منحوتة بالرياح ومشاهد بانورامية للوادي.',
      },
      Beach: {
        role: 'villager',
        namesEn: ['Corin', 'Marina', 'Finn', 'Lina'],
        namesAr: ['كورين', 'مارينا', 'فين', 'لينا'],
        titleEn: 'Coastal Forager',
        titleAr: 'باحثة الساحل',
        locEn: 'Golden Coastline Shore',
        locAr: 'شاطئ الساحل الذهبي',
        personaEn:
          'Relaxed shoreline explorer collecting driftwood, seashells, and watching coastal tides.',
        personaAr:
          'مستكشف ساحلي هادئ يجمع الأخشاب الطافية والأصداف ويراقب أمواج البحر.',
        greetMorningEn: 'Low tide washed fresh shells onto the cove sand this morning!',
        greetMorningAr: 'جلب الجزر أصدافًا جديدة إلى رمال الخليج هذا الصباح!',
        greetDayEn: 'Notice how palms lean with the sea breeze along the bay.',
        greetDayAr: 'لاحظ كيف تميل أشجار النخيل مع نسيم البحر على طول الخليج.',
        greetEveningEn: 'Sunsets sparkle across the bay waves better than anywhere in the valley.',
        greetEveningAr: 'غروب الشمس يتلألأ فوق أمواج الخليج بأجمل صورة في الوادي.',
        greetNightEn: 'Listening to the surf rolling in beneath the stars.',
        greetNightAr: 'أستمع إلى هدير الأمواج تحت أضواء النجوم.',
        factEn:
          'The Valley River flows all the way down into this southern cove beneath the palms.',
        factAr:
          'ينساب نهر الوادي طوال الطريق ليصب في هذا الخليج الجنوبي تحت النخيل.',
      },
      Plains: {
        role: 'farmer',
        namesEn: ['Cedric', 'Hana', 'Miles', 'Nora'],
        namesAr: ['سيدريك', 'هناء', 'مايلز', 'نورا'],
        titleEn: 'Valley Wayfarer',
        titleAr: 'رحّالة الوادي',
        locEn: 'Sunlit Rolling Plains',
        locAr: 'السهول المشمسة الممتدة',
        personaEn:
          'Upbeat countryside traveler admiring wildflowers, rolling grass waves, and peaceful open meadows.',
        personaAr:
          'رحّالة ريفي متفائل يستمتع بالأزهار البرية وتموّجات العشب والمروج المفتوحة.',
        greetMorningEn: 'Nothing wakes the spirit like morning dew glistening over wildflower meadows!',
        greetMorningAr: 'لا شيء ينعش الروح مثل ندى الصباح المتلألئ فوق مروج الأزهار!',
        greetDayEn: 'Open meadows are great for brisk travel—just give the wild deer a gentle berth.',
        greetDayAr: 'المروج المفتوحة رائعة للسفر السريع—اترك فقط مساحة هادئة للغزلان البرية.',
        greetEveningEn: 'Golden hour paints the meadow grass like waves of amber silk.',
        greetEveningAr: 'الساعة الذهبية تصبغ أعشاب المرج كأمواج من الحرير الكهرماني.',
        greetNightEn: 'Fireflies gather above the tall meadow grass after dusk.',
        greetNightAr: 'تتجمع اليراعات فوق الأعشاب الطويلة بعد حلول المساء.',
        factEn:
          'Oakhollow lies right in the heart of these plains—follow the cairns or check your World Map (M).',
        factAr:
          'تقع قرية أوكهولو في قلب هذه السهول—اتبع المعالم أو افتح خريطة العالم (M).',
      },
    };

    const pool = poolsByBiome[biome] ?? poolsByBiome.Plains;
    const idx = Math.floor(rand() * pool.namesEn.length) % pool.namesEn.length;
    const name = pool.namesEn[idx];
    const nameAr = pool.namesAr[idx];

    const ang1 = rand() * Math.PI * 2;
    const ang2 = ang1 + Math.PI * 0.75;
    const rawWp1 = { x: x + Math.cos(ang1) * 8, z: z + Math.sin(ang1) * 8 };
    const rawWp2 = { x: x + Math.cos(ang2) * 8, z: z + Math.sin(ang2) * 8 };
    const wp1 = isValidNPCSpawnLocation(rawWp1.x, rawWp1.z)
      ? rawWp1
      : (() => {
          const p = findNearestValidLand(rawWp1.x, rawWp1.z, 3.0, 0.34, 24);
          return { x: p.x, z: p.z };
        })();
    const wp2 = isValidNPCSpawnLocation(rawWp2.x, rawWp2.z)
      ? rawWp2
      : (() => {
          const p = findNearestValidLand(rawWp2.x, rawWp2.z, 3.0, 0.34, 24);
          return { x: p.x, z: p.z };
        })();

    return {
      id: `chunk-npc-${chunkKey}`,
      chunkKey,
      name,
      nameAr,
      role: pool.role,
      title: pool.titleEn,
      titleAr: pool.titleAr,
      location: pool.locEn,
      locationAr: pool.locAr,
      personality: pool.personaEn,
      personalityAr: pool.personaAr,
      seed: chunkSeed,
      spawn: { x, z },
      greetings: {
        morning: pool.greetMorningEn,
        midday: pool.greetDayEn,
        evening: pool.greetEveningEn,
        night: pool.greetNightEn,
      },
      greetingsAr: {
        morning: pool.greetMorningAr,
        midday: pool.greetDayAr,
        evening: pool.greetEveningAr,
        night: pool.greetNightAr,
      },
      choices: [
        {
          id: 'region',
          label: `What should I know about ${pool.locEn}?`,
          reply: pool.factEn,
          nextState: 'continue',
        },
        {
          id: 'bye',
          label: 'Safe travels!',
          reply: 'May clear skies guide your path ahead!',
          nextState: 'close',
        },
      ],
      choicesAr: [
        {
          id: 'region',
          label: `ما الذي يميّز ${pool.locAr}؟`,
          reply: pool.factAr,
          nextState: 'continue',
        },
        {
          id: 'bye',
          label: 'رحلة سعيدة!',
          reply: 'لترافقك السماء الصافية في طريقك!',
          nextState: 'close',
        },
      ],
      suggestedPrompts: [
        `Tell me about ${pool.locEn}.`,
        'Have you seen any wildlife nearby?',
        'What are you doing out here today?',
      ],
      suggestedPromptsAr: [
        `أخبرني عن ${pool.locAr}.`,
        'هل شاهدت أي حيوانات برية بالجوار؟',
        'ماذا تفعل هنا اليوم؟',
      ],
      schedule: [
        {
          period: 'morning',
          activityLabel: `Exploring ${pool.locEn}`,
          anchor: { x, z },
          mode: pool.role === 'guard' ? 'patrol' : 'wander',
          wanderRadius: 7.5,
          waypoints: [
            { x, z },
            wp1,
            wp2,
          ],
        },
        {
          period: 'midday',
          activityLabel: `Walking ${pool.locEn}`,
          anchor: wp1,
          mode: 'wander',
          wanderRadius: 8.0,
        },
        {
          period: 'evening',
          activityLabel: `Watching Sunset in ${pool.locEn}`,
          anchor: { x, z },
          mode: 'station',
          wanderRadius: 2.0,
          facingYaw: rand() * Math.PI * 2,
        },
        {
          period: 'night',
          activityLabel: `Resting at Camp`,
          anchor: { x, z },
          mode: 'station',
          wanderRadius: 1.5,
          facingYaw: rand() * Math.PI * 2,
        },
      ],
      routineLabelsAr: {
        morning: `يستكشف ${pool.locAr}`,
        midday: `يتجول في ${pool.locAr}`,
        evening: `يرقب الغروب في ${pool.locAr}`,
        night: `يستريح قرب المخيم`,
      },
    };
  }

  public applyGraphicsProfile(profile: ResolvedGraphicsProfile): void {
    this.drawDistSq = profile.npcDrawDist * profile.npcDrawDist;
    this.midDistSq = profile.npcMidDist * profile.npcMidDist;
    this.nameplateDistSq = profile.npcNameplateDist * profile.npcNameplateDist;
    this.shadowDistSq = profile.entityShadowDist * profile.entityShadowDist;
    this.shadowsEnabled = profile.shadowEnabled;
    this.farPause = profile.npcFarPause;
  }

  public getVisibleNpcCount(): number {
    return this.visibleNpcCount;
  }

  public getChunkSpawnedNpcCount(): number {
    let count = 0;
    this.chunkNpcs.forEach((arr) => {
      count += arr.length;
    });
    return count;
  }

  public update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    queryCollidersNear: (x: number, z: number) => WorldCollider[],
    externalWorldHours?: number,
  ): void {
    if (externalWorldHours !== undefined) {
      this.worldHours = ((externalWorldHours % 24) + 24) % 24;
    } else {
      this.worldHours = (this.worldHours + dt * this.hoursPerRealSecond) % 24;
    }
    this.frameCounter++;
    const period = this.getRoutinePeriod();

    const combatInfo = this.enemyCombatProvider?.() ?? null;
    const ctx = this.tickCtx;
    ctx.elapsed = elapsed;
    ctx.period = period;
    ctx.playerPos = playerPos;
    ctx.queryCollidersNear = queryCollidersNear;
    ctx.enemies = combatInfo?.enemies;
    ctx.damageSystem = combatInfo?.damageSystem ?? null;

    // Visibility culling + active-only position cache (keeps O(active^2) tiny regardless of total world NPC count)
    this.positionCache.length = 0;
    this.visibleNpcScratch.length = 0;

    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      const dx = playerPos.x - npc.position.x;
      const dz = playerPos.z - npc.position.z;
      const distSq = dx * dx + dz * dz;
      const visible = distSq <= this.drawDistSq;
      const showNameplate = distSq <= this.nameplateDistSq;
      npc.setVisibility(visible, showNameplate);

      if (!visible) {
        npc.pendingDt = 0;
        continue;
      }

      this.positionCache.push({
        id: npc.id,
        x: npc.position.x,
        z: npc.position.z,
      });
      this.visibleNpcScratch.push({ npc, index: i, distSq });
    }

    for (let v = 0; v < this.visibleNpcScratch.length; v++) {
      const item = this.visibleNpcScratch[v];
      const npc = item.npc;
      const distSq = item.distSq;
      npc.rig.setLodDetail(distSq > this.midDistSq);
      npc.rig.setShadowCasting(this.shadowsEnabled && distSq <= this.shadowDistSq);

      if (distSq <= this.shadowDistSq) {
        ctx.dt = dt + npc.pendingDt;
        npc.pendingDt = 0;
        npc.update(ctx);
      } else if (distSq <= this.midDistSq) {
        npc.pendingDt += dt;
        if ((item.index + this.frameCounter) % 3 === 0) {
          ctx.dt = npc.pendingDt;
          npc.pendingDt = 0;
          npc.update(ctx);
        }
      } else if (!this.farPause) {
        npc.pendingDt += dt;
        if (((item.index + this.frameCounter) & 7) === 0) {
          ctx.dt = npc.pendingDt;
          npc.pendingDt = 0;
          npc.update(ctx);
        }
      }
    }
    this.visibleNpcCount = this.visibleNpcScratch.length;
  }

  public rayTestProjectile(
    prevPos: THREE.Vector3,
    nextPos: THREE.Vector3,
    hitPadding = 0.2,
  ): { npc: NPCBase; isHeadshot: boolean; hitPoint: THREE.Vector3 } | null {
    const segX = nextPos.x - prevPos.x;
    const segY = nextPos.y - prevPos.y;
    const segZ = nextPos.z - prevPos.z;
    const segLenSq = segX * segX + segY * segY + segZ * segZ;
    if (segLenSq < 0.00001) return null;

    let bestNpc: NPCBase | null = null;
    let bestT = Infinity;
    let bestIsHeadshot = false;

    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      if (!npc.rig.root.visible || npc.isSleeping() || npc.isDead) continue;

      const cx = npc.position.x;
      const cz = npc.position.z;
      const baseY = npc.position.y;
      const hitH = npc.getHitHeight();
      const rad = npc.getHitRadius() + hitPadding;
      const radSq = rad * rad;

      const hLenSq = segX * segX + segZ * segZ;
      const t =
        hLenSq > 0.00001
          ? Math.max(
              0,
              Math.min(
                1,
                ((cx - prevPos.x) * segX + (cz - prevPos.z) * segZ) / hLenSq,
              ),
            )
          : 0.5;
      const px = prevPos.x + segX * t;
      const py = prevPos.y + segY * t;
      const pz = prevPos.z + segZ * t;
      const dx = px - cx;
      const dz = pz - cz;
      if (dx * dx + dz * dz <= radSq && py >= baseY && py <= baseY + hitH + 0.12) {
        if (t < bestT) {
          bestT = t;
          bestNpc = npc;
          bestIsHeadshot = py >= baseY + hitH * 0.75;
          _npcHitPoint.set(px, py, pz);
        }
      }
    }

    if (!bestNpc) return null;
    return { npc: bestNpc, isHeadshot: bestIsHeadshot, hitPoint: _npcHitPoint };
  }

  public reactToArrowHit(npcId: string, sourceX: number, sourceZ: number): void {
    for (let i = 0; i < this.npcs.length; i++) {
      if (this.npcs[i].id === npcId) {
        this.npcs[i].reactToArrowHit(sourceX, sourceZ);
        return;
      }
    }
  }

  public findNpcsInStrikeArc(
    origin: THREE.Vector3,
    forwardDir: THREE.Vector3,
    range: number,
    minCos: number,
  ): NPCBase[] {
    const hits: NPCBase[] = [];
    const maxDist = range + 0.6;
    const maxDistSq = maxDist * maxDist;
    const fLen = Math.hypot(forwardDir.x, forwardDir.z) || 1;
    const fx = forwardDir.x / fLen;
    const fz = forwardDir.z / fLen;

    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      if (npc.isDead || !npc.rig.root.visible) continue;
      const dx = npc.position.x - origin.x;
      const dz = npc.position.z - origin.z;
      const dSq = dx * dx + dz * dz;
      if (dSq > maxDistSq || Math.abs(npc.position.y - origin.y) > 2.8) continue;
      const dist = Math.sqrt(dSq);
      if (dist > 0.35) {
        const dot = (dx / dist) * fx + (dz / dist) * fz;
        if (dot < minCos) continue;
      }
      hits.push(npc);
    }
    return hits;
  }

  public applyAuthoritativeDamage(
    npcId: string,
    hp: number,
    maxHp: number,
    killed: boolean,
    attackerX?: number,
    attackerZ?: number,
  ): { npc: NPCBase; justKilled: boolean } | null {
    const npc = this.npcs.find((n) => n.id === npcId);
    if (!npc) return null;
    const justKilled = npc.applyAuthoritativeHealth(hp, maxHp, killed, attackerX, attackerZ);
    return { npc, justKilled };
  }

  public exportSyncDeltas(
    centers: Array<{ x: number; z: number }>,
    maxCount = 12,
    maxRadius = 75,
  ): SyncedEntityDelta[] {
    if (this.networkRemoteControlled || centers.length === 0) return [];
    const rSq = maxRadius * maxRadius;
    const deltas: SyncedEntityDelta[] = [];

    for (let i = 0; i < this.npcs.length && deltas.length < maxCount; i++) {
      const npc = this.npcs[i];
      let near = false;
      for (let c = 0; c < centers.length; c++) {
        const dx = npc.position.x - centers[c].x;
        const dz = npc.position.z - centers[c].z;
        if (dx * dx + dz * dz <= rSq) {
          near = true;
          break;
        }
      }
      if (!near) continue;

      const state = npc.getBehaviorState();
      const yaw = npc.getYaw();
      const prev = this.lastSyncSnapshot.get(npc.id);
      const moved =
        !prev ||
        Math.abs(npc.position.x - prev.x) > 0.08 ||
        Math.abs(npc.position.y - prev.y) > 0.08 ||
        Math.abs(npc.position.z - prev.z) > 0.08 ||
        Math.abs(yaw - prev.yaw) > 0.06 ||
        prev.state !== state ||
        prev.hp !== npc.hp ||
        prev.isDead !== npc.isDead;

      if (!moved) continue;

      const x = Math.round(npc.position.x * 100) / 100;
      const y = Math.round(npc.position.y * 100) / 100;
      const z = Math.round(npc.position.z * 100) / 100;
      const roundedYaw = Math.round(yaw * 1000) / 1000;
      this.lastSyncSnapshot.set(npc.id, {
        x,
        y,
        z,
        yaw: roundedYaw,
        state,
        hp: npc.hp,
        isDead: npc.isDead,
      });

      deltas.push({
        id: npc.id,
        kind: 'npc',
        archetype: npc.role,
        x,
        y,
        z,
        yaw: roundedYaw,
        state,
        hp: npc.hp,
        maxHp: npc.maxHealth,
        isDead: npc.isDead,
      });
    }
    return deltas;
  }

  public applySyncDeltas(deltas: SyncedEntityDelta[]): void {
    for (let i = 0; i < deltas.length; i++) {
      const d = deltas[i];
      if (d.kind !== 'npc') continue;
      const npc = this.npcs.find((n) => n.id === d.id);
      if (npc) {
        npc.applyRemoteSync(d);
      }
    }
  }

  public dispose(): void {
    for (const npc of this.npcs) {
      npc.dispose();
    }
    this.chunkNpcs.clear();
    this.assets.dispose();
    this.npcGroup.removeFromParent();
  }
}
