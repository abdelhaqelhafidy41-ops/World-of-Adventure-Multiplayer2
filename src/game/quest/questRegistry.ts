import rawQuests from './quests.json';
import type { QuestDefinition } from './questTypes';

const questRegistry = new Map<string, QuestDefinition>(
  (rawQuests as unknown as QuestDefinition[]).map((q) => [q.id, q]),
);
const proceduralQuestIds = new Set<string>();

export function getQuestDefinition(questId: string): QuestDefinition | undefined {
  return questRegistry.get(questId);
}

export function getAllQuestDefinitions(): QuestDefinition[] {
  return Array.from(questRegistry.values());
}

/**
 * Dynamically registers a new quest definition without modifying QuestManager.
 */
export function registerQuestDefinition(quest: QuestDefinition): void {
  questRegistry.set(quest.id, quest);
}

export function registerProceduralQuest(quest: QuestDefinition): void {
  proceduralQuestIds.add(quest.id);
  questRegistry.set(quest.id, quest);
}

export function clearProceduralQuests(): void {
  for (const id of proceduralQuestIds) {
    questRegistry.delete(id);
  }
  proceduralQuestIds.clear();
}
