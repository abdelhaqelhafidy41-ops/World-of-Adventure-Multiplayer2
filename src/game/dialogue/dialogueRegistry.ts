import rawDialogues from './npcDialogues.json';
import { AR_DIALOGUE_TREES } from '../i18n/arContent';
import type { Language } from '../i18n/translations';
import type { DialogueTree } from './dialogueTypes';

export {
  getQuestDefinition,
  getAllQuestDefinitions,
  registerQuestDefinition,
} from '../quest/questRegistry';

const dialogueTrees: Map<string, DialogueTree> = new Map(
  Object.entries(rawDialogues as unknown as Record<string, DialogueTree>),
);
const proceduralDialogueTreesEn = new Map<string, DialogueTree>();
const proceduralDialogueTreesAr = new Map<string, DialogueTree>();

/**
 * Retrieves a data-driven dialogue tree for an NPC ID in the requested language.
 */
export function getDialogueTree(
  npcId: string,
  lang: Language = 'en',
): DialogueTree | undefined {
  if (lang === 'ar') {
    return (
      proceduralDialogueTreesAr.get(npcId) ??
      AR_DIALOGUE_TREES[npcId] ??
      proceduralDialogueTreesEn.get(npcId) ??
      dialogueTrees.get(npcId)
    );
  }
  return proceduralDialogueTreesEn.get(npcId) ?? dialogueTrees.get(npcId);
}

/**
 * Registers or overrides an NPC dialogue tree dynamically without editing the engine.
 */
export function registerDialogueTree(tree: DialogueTree): void {
  dialogueTrees.set(tree.npcId, tree);
}

export function registerProceduralDialogueTree(
  treeEn: DialogueTree,
  treeAr?: DialogueTree,
): void {
  proceduralDialogueTreesEn.set(treeEn.npcId, treeEn);
  if (treeAr) {
    proceduralDialogueTreesAr.set(treeAr.npcId, treeAr);
  }
}

export function clearProceduralDialogues(): void {
  proceduralDialogueTreesEn.clear();
  proceduralDialogueTreesAr.clear();
}

export function getAllDialogueTrees(): DialogueTree[] {
  return [...Array.from(dialogueTrees.values()), ...Array.from(proceduralDialogueTreesEn.values())];
}
