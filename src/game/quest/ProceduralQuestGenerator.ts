import { PLAYABLE_RADIUS, seededRandom } from '../math/noise';
import type { DialogueChoiceNode, DialogueNode, DialogueTree } from '../dialogue/dialogueTypes';
import {
  clearProceduralDialogues,
  registerProceduralDialogueTree,
} from '../dialogue/dialogueRegistry';
import { getLocalizedVillageName } from '../i18n/translations';
import type { NPCBase } from '../npc/NPCBase';
import type { VillageSiteRecord } from '../world/VillageManager';
import { findNearestValidLand, isLand, isWater } from '../world/WorldPlacementValidator';
import { clearProceduralQuests, registerProceduralQuest } from './questRegistry';
import type { QuestDefinition, QuestObjectiveDef } from './questTypes';

export interface ProceduralQuestGenResult {
  questCount: number;
  dialogueTreeCount: number;
}

interface BilingualItemRef {
  id: string;
  en: string;
  ar: string;
}

const ARCHETYPE_ITEMS: Record<string, BilingualItemRef[]> = {
  plains: [
    { id: 'wheat', en: 'Golden Wheat', ar: 'قمح ذهبي' },
    { id: 'fiber', en: 'Wild Fiber', ar: 'ألياف برية' },
    { id: 'flower', en: 'Meadow Wildflower', ar: 'زهرة مرج' },
    { id: 'stone', en: 'Fieldstone', ar: 'حجر الحقول' },
  ],
  valley: [
    { id: 'wood', en: 'Timber Logs', ar: 'أخشاب الوادي' },
    { id: 'clay', en: 'River Clay', ar: 'طين النهر' },
    { id: 'iron-ore', en: 'Iron Ore', ar: 'خام الحديد' },
    { id: 'meadow-herb', en: 'Meadow Herb', ar: 'عشبة المرج' },
  ],
  forest: [
    { id: 'wood', en: 'Timber Logs', ar: 'أخشاب الغابة' },
    { id: 'mushroom', en: 'Forest Mushrooms', ar: 'فطر الغابة' },
    { id: 'berries', en: 'Wild Berries', ar: 'توت بري' },
    { id: 'fiber', en: 'Wild Fiber', ar: 'ألياف برية' },
  ],
  mountain: [
    { id: 'stone', en: 'Granite Stone', ar: 'حجر الجرانيت' },
    { id: 'iron-ore', en: 'Iron Ore', ar: 'خام الحديد' },
    { id: 'coal', en: 'Coal Lump', ar: 'قطع الفحم' },
    { id: 'gold-ore', en: 'Gold Ore', ar: 'خام الذهب' },
  ],
  desert: [
    { id: 'sand', en: 'Golden Sand', ar: 'رمال ذهبية' },
    { id: 'cactus', en: 'Desert Cactus', ar: 'صبّار صحراوي' },
    { id: 'desert-plant', en: 'Sunbloom Sage', ar: 'نبات شمس الصحراء' },
    { id: 'stone', en: 'Sandstone', ar: 'حجر رملي' },
  ],
  oasis: [
    { id: 'wheat', en: 'Golden Wheat', ar: 'قمح ذهبي' },
    { id: 'desert-plant', en: 'Sunbloom Sage', ar: 'نبات شمس الصحراء' },
    { id: 'cactus', en: 'Desert Cactus', ar: 'صبّار صحراوي' },
    { id: 'clay', en: 'River Clay', ar: 'طين النهر' },
  ],
  river: [
    { id: 'clay', en: 'River Clay', ar: 'طين النهر' },
    { id: 'wood', en: 'Alder Timber', ar: 'أخشاب النهر' },
    { id: 'wheat', en: 'Golden Wheat', ar: 'قمح ذهبي' },
    { id: 'fiber', en: 'Bankside Reeds', ar: 'ألياف الضفاف' },
  ],
  coastal: [
    { id: 'shell', en: 'Coastal Seashells', ar: 'أصداف ساحلية' },
    { id: 'driftwood', en: 'Sea Driftwood', ar: 'خشب طافٍ' },
    { id: 'sand', en: 'Beach Sand', ar: 'رمال الشاطئ' },
    { id: 'clay', en: 'Estuary Clay', ar: 'طين المصب' },
  ],
};

interface CraftQuestRecipeRef {
  itemId: string;
  en: string;
  ar: string;
}

const CRAFT_TARGETS: CraftQuestRecipeRef[] = [
  { itemId: 'arrow', en: 'Hunting Arrows', ar: 'سهام صيد' },
  { itemId: 'torch', en: 'Camp Torches', ar: 'مشاعل مخيم' },
  { itemId: 'hearth-loaf', en: 'Sunstone Hearth Loaf', ar: 'رغيف الموقد' },
  { itemId: 'apothecary-tonic', en: 'Apothecary Tonic', ar: 'جرعة شفاء' },
];

interface EnemyQuestRef {
  enemyType: string;
  en: string;
  ar: string;
}

const ARCHETYPE_ENEMIES: Record<string, EnemyQuestRef> = {
  plains: { enemyType: 'bandit_scout', en: 'Bandit Scouts', ar: 'كشّافي اللصوص' },
  valley: { enemyType: 'thorn_stalker', en: 'Thorn Stalkers', ar: 'متعقّبي الأشواك' },
  forest: { enemyType: 'thorn_stalker', en: 'Thorn Stalkers', ar: 'متعقّبي الأشواك' },
  mountain: { enemyType: 'stone_sentinel', en: 'Stone Sentinels', ar: 'حراس الحجر' },
  desert: { enemyType: 'bandit_scout', en: 'Desert Raiders', ar: 'غزاة الصحراء' },
  oasis: { enemyType: 'bandit_scout', en: 'Caravan Raiders', ar: 'قطاع القوافل' },
  river: { enemyType: 'bandit_scout', en: 'Riverbank Marauders', ar: 'لصوص الضفاف' },
  coastal: { enemyType: 'thorn_stalker', en: 'Coast Lurkers', ar: 'متعقّبي الساحل' },
};

function pickReachPointNearVillage(
  village: VillageSiteRecord,
  rand: () => number,
): { x: number; z: number } {
  for (let i = 0; i < 16; i++) {
    const ang = rand() * Math.PI * 2;
    const dist = 52 + rand() * 55;
    const cx = Math.max(-PLAYABLE_RADIUS + 40, Math.min(PLAYABLE_RADIUS - 40, village.centerX + Math.cos(ang) * dist));
    const cz = Math.max(-PLAYABLE_RADIUS + 40, Math.min(PLAYABLE_RADIUS - 40, village.centerZ + Math.sin(ang) * dist));
    if (!isWater(cx, cz) && isLand(cx, cz, 0.5)) {
      return { x: Math.round(cx), z: Math.round(cz) };
    }
  }
  const safe = findNearestValidLand(village.centerX + 55, village.centerZ, 3.0, 0.35, 64);
  return { x: Math.round(safe.x), z: Math.round(safe.z) };
}

function buildNpcQuestDialogueTrees(
  npc: NPCBase,
  villageNameEn: string,
  villageNameAr: string,
  givenQuests: QuestDefinition[],
  turnInQuests: QuestDefinition[],
): { en: DialogueTree; ar: DialogueTree } {
  const enNodes: Record<string, DialogueNode> = {};
  const arNodes: Record<string, DialogueNode> = {};
  const enEntryRules: DialogueTree['entryRules'] = [];
  const arEntryRules: DialogueTree['entryRules'] = [];

  const enGreetChoices: DialogueChoiceNode[] = [];
  const arGreetChoices: DialogueChoiceNode[] = [];

  const allTurnIns = new Map<string, QuestDefinition>();
  for (const q of turnInQuests) allTurnIns.set(q.id, q);
  for (const q of givenQuests) {
    if (!q.turnInNpcId || q.turnInNpcId === npc.id) {
      allTurnIns.set(q.id, q);
    }
  }

  for (const q of allTurnIns.values()) {
    const readyId = `ready_${q.id}`;
    const completeDoneId = `completed_${q.id}`;

    enEntryRules.push({
      condition: { questId: q.id, questStatusIn: ['ready'] },
      nodeId: readyId,
    });
    arEntryRules.push({
      condition: { questId: q.id, questStatusIn: ['ready'] },
      nodeId: readyId,
    });

    enNodes[readyId] = {
      id: readyId,
      questId: q.id,
      lines: [
        `You finished "${q.title}"! ${villageNameEn} owes you real gratitude.`,
      ],
      choices: [
        {
          id: `turnin-${q.id}`,
          label: `Complete: ${q.title}`,
          nextNodeId: completeDoneId,
          questTag: 'complete',
          effects: [{ type: 'completeQuest', questId: q.id }],
        },
        {
          id: `notyet-${q.id}`,
          label: 'Hold on a moment.',
          nextNodeId: null,
        },
      ],
    };
    arNodes[readyId] = {
      id: readyId,
      questId: q.id,
      lines: [
        `لقد أتممت "${q.titleAr ?? q.title}"! أهالي ${villageNameAr} ممتنون لك كثيراً.`,
      ],
      choices: [
        {
          id: `turnin-${q.id}`,
          label: `إكمال: ${q.titleAr ?? q.title}`,
          nextNodeId: completeDoneId,
          questTag: 'complete',
          effects: [{ type: 'completeQuest', questId: q.id }],
        },
        {
          id: `notyet-${q.id}`,
          label: 'انتظر لحظة.',
          nextNodeId: null,
        },
      ],
    };

    enNodes[completeDoneId] = {
      id: completeDoneId,
      lines: [`Well earned, traveler! Safe roads out of ${villageNameEn}.`],
      nextNodeId: null,
    };
    arNodes[completeDoneId] = {
      id: completeDoneId,
      lines: [`تستحقها عن جدارة أيها المغامر! رحلة آمنة خارج ${villageNameAr}.`],
      nextNodeId: null,
    };
  }

  for (const q of givenQuests) {
    const activeId = `active_${q.id}`;
    const offerId = `offer_${q.id}`;
    const acceptDoneId = `accepted_${q.id}`;

    enGreetChoices.push({
      id: `ask-offer-${q.id}`,
      label: `Task: ${q.title}`,
      nextNodeId: offerId,
      questTag: 'accept',
      condition: { questId: q.id, questStatusIn: ['available'] },
    });
    arGreetChoices.push({
      id: `ask-offer-${q.id}`,
      label: `مهمة: ${q.titleAr ?? q.title}`,
      nextNodeId: offerId,
      questTag: 'accept',
      condition: { questId: q.id, questStatusIn: ['available'] },
    });

    enGreetChoices.push({
      id: `ask-progress-${q.id}`,
      label: `Check progress: ${q.title}`,
      nextNodeId: activeId,
      questTag: 'progress',
      condition: { questId: q.id, questStatusIn: ['active'] },
    });
    arGreetChoices.push({
      id: `ask-progress-${q.id}`,
      label: `متابعة: ${q.titleAr ?? q.title}`,
      nextNodeId: activeId,
      questTag: 'progress',
      condition: { questId: q.id, questStatusIn: ['active'] },
    });

    enNodes[offerId] = {
      id: offerId,
      questId: q.id,
      lines: [q.description, `Reward: ${q.rewardSummary}`],
      choices: [
        {
          id: `accept-${q.id}`,
          label: 'Accept Quest',
          nextNodeId: acceptDoneId,
          questTag: 'accept',
          effects: [{ type: 'startQuest', questId: q.id }],
        },
        {
          id: `decline-${q.id}`,
          label: 'Maybe later.',
          nextNodeId: 'greet',
        },
      ],
    };
    arNodes[offerId] = {
      id: offerId,
      questId: q.id,
      lines: [q.descriptionAr ?? q.description, `المكافأة: ${q.rewardSummaryAr ?? q.rewardSummary}`],
      choices: [
        {
          id: `accept-${q.id}`,
          label: 'قبول المهمة',
          nextNodeId: acceptDoneId,
          questTag: 'accept',
          effects: [{ type: 'startQuest', questId: q.id }],
        },
        {
          id: `decline-${q.id}`,
          label: 'ربما لاحقاً.',
          nextNodeId: 'greet',
        },
      ],
    };

    enNodes[acceptDoneId] = {
      id: acceptDoneId,
      questId: q.id,
      lines: [`Wonderful! Return once you have completed it in ${villageNameEn}.`],
      nextNodeId: null,
    };
    arNodes[acceptDoneId] = {
      id: acceptDoneId,
      questId: q.id,
      lines: [`رائع! بالتوفيق في مهمتك في ${villageNameAr}.`],
      nextNodeId: null,
    };

    enNodes[activeId] = {
      id: activeId,
      questId: q.id,
      lines: [`Still working on "${q.title}"? Check your journal whenever you need directions.`],
      nextNodeId: null,
    };
    arNodes[activeId] = {
      id: activeId,
      questId: q.id,
      lines: [`هل ما زلت تعمل على "${q.titleAr ?? q.title}"؟ يمكنك مراجعة سجل المهام في أي وقت.`],
      nextNodeId: null,
    };
  }

  enGreetChoices.push(
    {
      id: 'about-village',
      label: `Tell me about ${villageNameEn}.`,
      nextNodeId: 'about',
    },
    {
      id: 'bye',
      label: 'Farewell.',
      nextNodeId: null,
    },
  );
  arGreetChoices.push(
    {
      id: 'about-village',
      label: `أخبرني عن ${villageNameAr}.`,
      nextNodeId: 'about',
    },
    {
      id: 'bye',
      label: 'إلى اللقاء.',
      nextNodeId: null,
    },
  );

  enNodes.greet = {
    id: 'greet',
    lines: [`Greetings from ${villageNameEn}! Always good to see an adventurer on dry ground.`],
    choices: enGreetChoices,
  };
  arNodes.greet = {
    id: 'greet',
    lines: [`تحياتي من ${villageNameAr}! يسعدنا دائماً رؤية مغامر في قريتنا.`],
    choices: arGreetChoices,
  };

  enNodes.about = {
    id: 'about',
    lines: [
      `${villageNameEn} gathers local resources, keeps guards on perimeter patrol, and welcomes passing traders.`,
    ],
    choices: [{ id: 'back', label: 'Anything else?', nextNodeId: 'greet' }],
  };
  arNodes.about = {
    id: 'about',
    lines: [
      `تجمع ${villageNameAr} الموارد المحلية وتحافظ على حراسة طرقاتها وترحب بالتجار والمسافرين.`,
    ],
    choices: [{ id: 'back', label: 'هل من شيء آخر؟', nextNodeId: 'greet' }],
  };

  return {
    en: {
      npcId: npc.id,
      defaultStartNodeId: 'greet',
      entryRules: enEntryRules,
      nodes: enNodes,
    },
    ar: {
      npcId: npc.id,
      defaultStartNodeId: 'greet',
      entryRules: arEntryRules,
      nodes: arNodes,
    },
  };
}

/**
 * Generates 3-6 deterministic procedural quests + matching bilingual dialogue trees
 * for each of the 27 procedural villages in the world.
 */
export function generateAndRegisterProceduralQuests(
  worldSeed: number,
  villages: readonly VillageSiteRecord[],
  npcs: readonly NPCBase[],
): ProceduralQuestGenResult {
  clearProceduralQuests();
  clearProceduralDialogues();

  let totalQuests = 0;
  let totalDialogues = 0;

  const npcsByPrefix = new Map<string, NPCBase[]>();
  for (const npc of npcs) {
    const match = npc.id.match(/^npc-(proc-(?:village-)?\d+)-/);
    if (match) {
      const vid = match[1];
      let arr = npcsByPrefix.get(vid);
      if (!arr) {
        arr = [];
        npcsByPrefix.set(vid, arr);
      }
      arr.push(npc);
    }
  }

  for (const village of villages) {
    if (!village.isProcedural) continue;
    const villageNpcs = npcsByPrefix.get(village.id) ?? [];
    if (villageNpcs.length === 0) continue;

    const archetype = village.archetype ?? 'plains';
    const rand = seededRandom(
      (worldSeed ^ Math.round(village.centerX * 73) ^ Math.round(village.centerZ * 37) ^ 0x51a9c21d) >>> 0,
    );

    const targetQuestCount = Math.max(
      3,
      Math.min(6, village.populationPlan?.questCount ?? 4),
    );
    const villageNameAr = getLocalizedVillageName(village.id, village.name, 'ar');

    // Prefer quest givers from leader, guards, workers, trader, then villagers
    const sortedGivers = [...villageNpcs].sort((a, b) => {
      const score = (r: string) =>
        r === 'elder' ? 0 : r === 'guard' ? 1 : r === 'merchant' || r === 'traveling_merchant' ? 2 : r !== 'villager' ? 3 : 4;
      return score(a.role) - score(b.role);
    });

    const itemsPool = ARCHETYPE_ITEMS[archetype] ?? ARCHETYPE_ITEMS.plains;
    const enemyRef = ARCHETYPE_ENEMIES[archetype] ?? ARCHETYPE_ENEMIES.plains;

    const questsByGiver = new Map<string, QuestDefinition[]>();
    const questsByTurnIn = new Map<string, QuestDefinition[]>();
    const touchedNpcIds = new Set<string>();
    const npcById = new Map(villageNpcs.map((n) => [n.id, n]));

    for (let qIdx = 0; qIdx < targetQuestCount; qIdx++) {
      const giver = sortedGivers[qIdx % sortedGivers.length];
      const questId = `pquest-${village.id}-${qIdx + 1}`;
      const variant = qIdx % 5; // Rotate through 5 distinct quest mechanics

      const xp = 60 + Math.floor(rand() * 55) + qIdx * 10;
      const coins = 25 + Math.floor(rand() * 35) + qIdx * 5;
      const rewardSummary = `${xp} XP · ${coins} Coins`;
      const rewardSummaryAr = `${xp} خبرة · ${coins} عملة`;

      let title = '';
      let titleAr = '';
      let description = '';
      let descriptionAr = '';
      let turnInNpcId = giver.id;
      const objectives: QuestObjectiveDef[] = [];

      if (variant === 0) {
        // Gather biome resources
        const item = itemsPool[qIdx % itemsPool.length];
        const qty = 3 + Math.floor(rand() * 3);
        title = `${village.name} Supplies: ${item.en}`;
        titleAr = `إمدادات ${villageNameAr}: ${item.ar}`;
        description = `${giver.name} needs ${qty} ${item.en} gathered around ${village.name} to replenish village stores.`;
        descriptionAr = `يحتاج ${giver.getLocalizedName('ar')} إلى جمع ${qty} من ${item.ar} لدعم مخازن ${villageNameAr}.`;
        objectives.push({
          id: `${questId}-collect`,
          type: 'collect_items',
          description: `Gather ${qty} ${item.en}`,
          descriptionAr: `اجمع ${qty} ${item.ar}`,
          itemId: item.id,
          requiredCount: qty,
          consumeOnComplete: true,
        });
      } else if (variant === 1) {
        // Guard / Defense: clear nearby hostiles
        const killCount = 2 + Math.floor(rand() * 2);
        title = `Defend ${village.name}`;
        titleAr = `حماية ${villageNameAr}`;
        description = `Drive back ${killCount} ${enemyRef.en} threatening the roads near ${village.name}, then report back.`;
        descriptionAr = `اقضِ على ${killCount} من ${enemyRef.ar} المتربصين قرب طرق ${villageNameAr} ثم عُد لإبلاغنا.`;
        objectives.push({
          id: `${questId}-kill`,
          type: 'kill_enemies',
          description: `Defeat ${killCount} ${enemyRef.en}`,
          descriptionAr: `اهزم ${killCount} من ${enemyRef.ar}`,
          enemyType: enemyRef.enemyType,
          requiredCount: killCount,
        });
      } else if (variant === 2) {
        // Delivery between two village NPCs
        const item = itemsPool[(qIdx + 1) % itemsPool.length];
        const qty = 2 + (qIdx % 2);
        const recipient =
          sortedGivers.find((n) => n.id !== giver.id && n.role !== 'guard') ??
          sortedGivers[(qIdx + 1) % sortedGivers.length];
        turnInNpcId = recipient.id;
        title = `Courier for ${village.name}`;
        titleAr = `رسالة بريد ${villageNameAr}`;
        description = `Collect ${qty} ${item.en} and deliver them safely to ${recipient.name} in ${village.name}.`;
        descriptionAr = `اجمع ${qty} ${item.ar} وسلّمها إلى ${recipient.getLocalizedName('ar')} في ${villageNameAr}.`;
        objectives.push({
          id: `${questId}-deliver`,
          type: 'deliver_items',
          description: `Deliver ${qty} ${item.en} to ${recipient.name}`,
          descriptionAr: `سلّم ${qty} ${item.ar} إلى ${recipient.getLocalizedName('ar')}`,
          itemId: item.id,
          requiredCount: qty,
          targetNpcId: recipient.id,
          consumeOnComplete: true,
        });
      } else if (variant === 3) {
        // Explore / Scout surrounding perimeter on valid land
        const targetPt = pickReachPointNearVillage(village, rand);
        const outpostName = `${village.name} Outskirts`;
        const outpostNameAr = `أطراف ${villageNameAr}`;
        title = `Scout Around ${village.name}`;
        titleAr = `استطلاع محيط ${villageNameAr}`;
        description = `Check the perimeter trail at (${targetPt.x}, ${targetPt.z}) outside ${village.name} and report back.`;
        descriptionAr = `تفقد المسار عند الإحداثيات (${targetPt.x}, ${targetPt.z}) خارج ${villageNameAr} ثم عُد إلينا.`;
        objectives.push(
          {
            id: `${questId}-reach`,
            type: 'reach_location',
            description: `Reach ${outpostName}`,
            descriptionAr: `بلوغ ${outpostNameAr}`,
            x: targetPt.x,
            z: targetPt.z,
            radius: 18,
            locationName: outpostName,
          },
          {
            id: `${questId}-report`,
            type: 'talk_to_npc',
            description: `Report back to ${giver.name}`,
            descriptionAr: `قدّم تقريرك إلى ${giver.getLocalizedName('ar')}`,
            npcId: giver.id,
          },
        );
      } else {
        // Craft essentials for the village
        const craftRef = CRAFT_TARGETS[qIdx % CRAFT_TARGETS.length];
        const qty = 1 + (craftRef.itemId === 'arrow' ? 1 : 0);
        title = `Craft for ${village.name}: ${craftRef.en}`;
        titleAr = `صناعة لـ ${villageNameAr}: ${craftRef.ar}`;
        description = `Craft ${qty} ${craftRef.en} using your field pack and bring word back to ${village.name}.`;
        descriptionAr = `اصنع ${qty} ${craftRef.ar} من قائمة الصناعة ثم عُد لإبلاغ ${giver.getLocalizedName('ar')}.`;
        objectives.push({
          id: `${questId}-craft`,
          type: 'craft_item',
          description: `Craft ${qty} ${craftRef.en}`,
          descriptionAr: `اصنع ${qty} ${craftRef.ar}`,
          itemId: craftRef.itemId,
          requiredCount: qty,
        });
      }

      const questDef: QuestDefinition = {
        id: questId,
        title,
        titleAr,
        giverNpcId: giver.id,
        turnInNpcId,
        description,
        descriptionAr,
        sequential: true,
        objectives,
        reward: {
          xp,
          coins,
          stamina: 25,
        },
        rewardSummary,
        rewardSummaryAr,
      };

      registerProceduralQuest(questDef);
      totalQuests++;

      const giverBucket = questsByGiver.get(giver.id) ?? [];
      giverBucket.push(questDef);
      questsByGiver.set(giver.id, giverBucket);
      touchedNpcIds.add(giver.id);

      const turnInBucket = questsByTurnIn.get(turnInNpcId) ?? [];
      turnInBucket.push(questDef);
      questsByTurnIn.set(turnInNpcId, turnInBucket);
      touchedNpcIds.add(turnInNpcId);
    }

    // Build and register dialogue trees for every quest-giving or turn-in NPC in this village
    for (const npcId of touchedNpcIds) {
      const npc = npcById.get(npcId);
      if (!npc) continue;
      const trees = buildNpcQuestDialogueTrees(
        npc,
        village.name,
        villageNameAr,
        questsByGiver.get(npcId) ?? [],
        questsByTurnIn.get(npcId) ?? [],
      );
      registerProceduralDialogueTree(trees.en, trees.ar);
      totalDialogues++;
    }
  }

  return { questCount: totalQuests, dialogueTreeCount: totalDialogues };
}
