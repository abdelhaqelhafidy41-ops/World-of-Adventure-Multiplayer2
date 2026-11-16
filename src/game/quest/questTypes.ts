import type { BiomeType } from '../types';

export type QuestType =
  | 'talk_to_npc'
  | 'collect_items'
  | 'reach_location'
  | 'kill_enemies'
  | 'deliver_items'
  | 'explore_area'
  | 'craft_item'
  | 'sleep_night';

export type QuestStatus = 'available' | 'active' | 'ready' | 'completed';

export interface TalkToNpcObjectiveDef {
  id: string;
  type: 'talk_to_npc';
  description: string;
  descriptionAr?: string;
  npcId: string;
}

export interface CollectItemsObjectiveDef {
  id: string;
  type: 'collect_items';
  description: string;
  descriptionAr?: string;
  itemId: string;
  requiredCount: number;
  consumeOnComplete?: boolean;
}

export interface ReachLocationObjectiveDef {
  id: string;
  type: 'reach_location';
  description: string;
  descriptionAr?: string;
  x: number;
  z: number;
  radius: number;
  locationName: string;
}

export interface KillEnemiesObjectiveDef {
  id: string;
  type: 'kill_enemies';
  description: string;
  descriptionAr?: string;
  enemyType: string;
  requiredCount: number;
}

export interface DeliverItemsObjectiveDef {
  id: string;
  type: 'deliver_items';
  description: string;
  descriptionAr?: string;
  itemId: string;
  requiredCount: number;
  targetNpcId: string;
  consumeOnComplete?: boolean;
}

export interface ExploreAreaObjectiveDef {
  id: string;
  type: 'explore_area';
  description: string;
  descriptionAr?: string;
  biome?: BiomeType;
  minLandmarks?: number;
  areaCenter?: {
    x: number;
    z: number;
    radius: number;
  };
}

export interface CraftItemObjectiveDef {
  id: string;
  type: 'craft_item';
  description: string;
  descriptionAr?: string;
  itemId: string;
  requiredCount: number;
}

export interface SleepNightObjectiveDef {
  id: string;
  type: 'sleep_night';
  description: string;
  descriptionAr?: string;
  requiredCount: number;
}

export type QuestObjectiveDef =
  | TalkToNpcObjectiveDef
  | CollectItemsObjectiveDef
  | ReachLocationObjectiveDef
  | KillEnemiesObjectiveDef
  | DeliverItemsObjectiveDef
  | ExploreAreaObjectiveDef
  | CraftItemObjectiveDef
  | SleepNightObjectiveDef;

export interface QuestRewardItem {
  id: string;
  name: string;
  description: string;
  count?: number;
  usable?: boolean;
}

export interface QuestReward {
  xp?: number;
  coins?: number;
  health?: number;
  stamina?: number;
  items?: QuestRewardItem[];
}

export interface QuestDefinition {
  id: string;
  title: string;
  titleAr?: string;
  giverNpcId: string;
  turnInNpcId?: string;
  description: string;
  descriptionAr?: string;
  sequential?: boolean;
  objectives: QuestObjectiveDef[];
  reward: QuestReward;
  rewardSummary: string;
  rewardSummaryAr?: string;
}

export interface QuestObjectiveView {
  id: string;
  type: QuestType;
  description: string;
  current: number;
  target: number;
  completed: boolean;
  active: boolean;
}

export interface QuestView {
  id: string;
  title: string;
  description: string;
  status: QuestStatus;
  giverNpcId: string;
  turnInNpcId?: string;
  objectives: QuestObjectiveView[];
  currentObjectiveText: string;
  progressText: string;
  reward: QuestReward;
  rewardSummary: string;
  tracked: boolean;
}

export interface QuestWorldContext {
  getItemCount: (itemId: string) => number;
  getDiscoveredLandmarksCount: () => number;
  playerX: number;
  playerZ: number;
  currentBiome: BiomeType;
}
