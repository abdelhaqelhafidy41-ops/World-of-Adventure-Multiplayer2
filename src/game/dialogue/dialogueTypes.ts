import type { NpcDialogueChoice, NpcRole, NpcRoutinePeriod } from '../types';
import type {
  QuestReward,
  QuestStatus,
  QuestView,
  QuestWorldContext,
} from '../quest/questTypes';

export type { QuestReward, QuestStatus, QuestView };

export interface DialogueCondition {
  questId?: string;
  questStatusIn?: QuestStatus[];
  hasItem?: {
    itemId: string;
    minCount?: number;
  };
  missingItem?: {
    itemId: string;
    maxCount?: number;
  };
  minCoins?: number;
  minDiscoveredLandmarks?: number;
  periodIn?: NpcRoutinePeriod[];
  flagSet?: string;
  flagUnset?: string;
}

export type DialogueEffect =
  | { type: 'startQuest'; questId: string }
  | { type: 'completeQuest'; questId: string }
  | {
      type: 'giveItem';
      item: {
        id: string;
        name: string;
        description: string;
        count?: number;
        usable?: boolean;
      };
    }
  | { type: 'consumeItem'; itemId: string; count: number }
  | { type: 'heal'; health?: number; stamina?: number }
  | { type: 'repairWeapons'; costCoins?: number }
  | { type: 'setFlag'; flag: string }
  | { type: 'notice'; message: string };

export interface DialogueChoiceNode {
  id: string;
  label: string;
  nextNodeId: string | null;
  condition?: DialogueCondition;
  effects?: DialogueEffect[];
  questTag?: 'accept' | 'complete' | 'progress';
}

export interface DialogueNode {
  id: string;
  speaker?: string;
  lines: string[];
  choices?: DialogueChoiceNode[];
  nextNodeId?: string | null;
  onEnterEffects?: DialogueEffect[];
  questId?: string;
}

export interface DialogueEntryRule {
  condition: DialogueCondition;
  nodeId: string;
}

export interface DialogueTree {
  npcId: string;
  defaultStartNodeId: string;
  entryRules?: DialogueEntryRule[];
  nodes: Record<string, DialogueNode>;
}

export interface DialogueNpcProfile {
  npcId: string;
  name: string;
  role: NpcRole;
  title: string;
  location: string;
  personality: string;
  suggestedPrompts: string[];
  routineLabel: string;
  routinePeriod: NpcRoutinePeriod;
  fallbackGreeting?: string;
  fallbackChoices?: NpcDialogueChoice[];
}

export interface DialogueWorldBridge extends QuestWorldContext {
  giveItem: (item: {
    id: string;
    name: string;
    description: string;
    count?: number;
    usable?: boolean;
  }) => void;
  consumeItem: (itemId: string, count: number) => void;
  healPlayer: (health: number, stamina: number) => void;
  getCoins: () => number;
  repairWeapons: (costCoins: number) => boolean;
  grantRewards: (reward: QuestReward, questTitle: string) => void;
  notify: (message: string) => void;
}

export interface DialogueSnapshot {
  npcId: string;
  npcName: string;
  npcRole: NpcRole;
  npcTitle: string;
  npcLocation: string;
  npcPersonality: string;
  suggestedPrompts: string[];
  routineLabel: string;
  routinePeriod: NpcRoutinePeriod;
  speaker: string;
  nodeId: string;
  currentLine: string;
  lineIndex: number;
  totalLines: number;
  hasMoreLines: boolean;
  canAutoAdvanceNode: boolean;
  choices: DialogueChoiceNode[];
  isTerminal: boolean;
  questInfo: QuestView | null;
}
