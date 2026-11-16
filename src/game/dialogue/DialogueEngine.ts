import { getDialogueTree } from './dialogueRegistry';
import type { Language } from '../i18n/translations';
import type {
  DialogueChoiceNode,
  DialogueCondition,
  DialogueEffect,
  DialogueNode,
  DialogueNpcProfile,
  DialogueSnapshot,
  DialogueTree,
  DialogueWorldBridge,
} from './dialogueTypes';
import { QuestManager } from '../quest/QuestManager';

/**
 * Reusable, data-driven branching & quest dialogue engine.
 * Driven purely by DialogueTree definitions (JSON/TS) and an injected DialogueWorldBridge.
 */
export class DialogueEngine {
  public readonly quests: QuestManager;
  private readonly bridge: DialogueWorldBridge;
  private readonly flags = new Set<string>();

  private activeProfile: DialogueNpcProfile | null = null;
  private activeTree: DialogueTree | null = null;
  private currentNode: DialogueNode | null = null;
  private lineIndex = 0;
  private language: Language = 'en';

  constructor(bridge: DialogueWorldBridge, quests = new QuestManager()) {
    this.bridge = bridge;
    this.quests = quests;
  }

  public setLanguage(lang: Language): void {
    this.language = lang;
    this.quests.setLanguage(lang);
  }

  public getLanguage(): Language {
    return this.language;
  }

  public isOpen(): boolean {
    return this.activeProfile !== null && this.currentNode !== null;
  }

  public startDialogue(
    profile: DialogueNpcProfile,
    customTree?: DialogueTree,
  ): DialogueSnapshot {
    this.activeProfile = profile;

    // Advance any active talk_to_npc / deliver_items steps for this NPC before resolving greeting rules
    this.quests.onNpcTalked(profile.npcId, this.bridge, (msg) =>
      this.bridge.notify(msg),
    );

    const tree =
      customTree ??
      getDialogueTree(profile.npcId, this.language) ??
      this.createFallbackTree(profile);
    this.activeTree = tree;

    const entryNodeId = this.resolveEntryNodeId(tree, profile);
    const entryNode =
      tree.nodes[entryNodeId] ??
      tree.nodes[tree.defaultStartNodeId] ??
      Object.values(tree.nodes)[0];

    this.enterNode(entryNode);
    return this.getSnapshot()!;
  }

  public next(): DialogueSnapshot | null {
    if (!this.currentNode || !this.activeTree || !this.activeProfile) {
      return null;
    }

    const totalLines = Math.max(1, this.currentNode.lines.length);
    if (this.lineIndex < totalLines - 1) {
      this.lineIndex += 1;
      return this.getSnapshot();
    }

    const visibleChoices = this.getVisibleChoices(this.currentNode);
    if (visibleChoices.length > 0) {
      return this.getSnapshot();
    }

    const nextId = this.currentNode.nextNodeId ?? null;
    if (!nextId || !this.activeTree.nodes[nextId]) {
      this.close();
      return null;
    }

    this.enterNode(this.activeTree.nodes[nextId]);
    return this.getSnapshot();
  }

  public selectChoice(choiceId: string): DialogueSnapshot | null {
    if (!this.currentNode || !this.activeTree || !this.activeProfile) {
      return null;
    }

    const visibleChoices = this.getVisibleChoices(this.currentNode);
    const choice = visibleChoices.find((c) => c.id === choiceId);
    if (!choice) {
      return this.getSnapshot();
    }

    if (choice.effects && choice.effects.length > 0) {
      this.applyEffects(choice.effects);
    }

    if (!choice.nextNodeId || !this.activeTree.nodes[choice.nextNodeId]) {
      this.close();
      return null;
    }

    this.enterNode(this.activeTree.nodes[choice.nextNodeId]);
    return this.getSnapshot();
  }

  public close(): void {
    this.activeProfile = null;
    this.activeTree = null;
    this.currentNode = null;
    this.lineIndex = 0;
  }

  public setFlag(flag: string): void {
    this.flags.add(flag);
  }

  public hasFlag(flag: string): boolean {
    return this.flags.has(flag);
  }

  public exportFlags(): string[] {
    return Array.from(this.flags);
  }

  public restoreFlags(flags: string[]): void {
    this.flags.clear();
    for (const f of flags) {
      this.flags.add(f);
    }
  }

  public getSnapshot(): DialogueSnapshot | null {
    if (!this.activeProfile || !this.currentNode) return null;

    const lines =
      this.currentNode.lines.length > 0
        ? this.currentNode.lines
        : [
            this.activeProfile.fallbackGreeting ??
              (this.language === 'ar'
                ? 'تحياتي أيها المسافر.'
                : 'Greetings, traveler.'),
          ];
    const totalLines = lines.length;
    const clampedIdx = Math.min(this.lineIndex, totalLines - 1);
    const hasMoreLines = clampedIdx < totalLines - 1;

    const visibleChoices = hasMoreLines
      ? []
      : this.getVisibleChoices(this.currentNode);

    const hasNextNode =
      !hasMoreLines &&
      visibleChoices.length === 0 &&
      typeof this.currentNode.nextNodeId === 'string' &&
      Boolean(this.activeTree?.nodes[this.currentNode.nextNodeId]);

    const isTerminal = !hasMoreLines && visibleChoices.length === 0 && !hasNextNode;

    const questInfo = this.currentNode.questId
      ? this.quests.getQuestView(this.currentNode.questId, this.bridge)
      : null;

    return {
      npcId: this.activeProfile.npcId,
      npcName: this.activeProfile.name,
      npcRole: this.activeProfile.role,
      npcTitle: this.activeProfile.title,
      npcLocation: this.activeProfile.location,
      npcPersonality: this.activeProfile.personality,
      suggestedPrompts: this.activeProfile.suggestedPrompts,
      routineLabel: this.activeProfile.routineLabel,
      routinePeriod: this.activeProfile.routinePeriod,
      speaker: this.currentNode.speaker ?? this.activeProfile.name,
      nodeId: this.currentNode.id,
      currentLine: lines[clampedIdx],
      lineIndex: clampedIdx,
      totalLines,
      hasMoreLines,
      canAutoAdvanceNode: hasNextNode,
      choices: visibleChoices,
      isTerminal,
      questInfo,
    };
  }

  private enterNode(node: DialogueNode): void {
    this.currentNode = node;
    this.lineIndex = 0;
    if (node.onEnterEffects && node.onEnterEffects.length > 0) {
      this.applyEffects(node.onEnterEffects);
    }
  }

  private resolveEntryNodeId(
    tree: DialogueTree,
    profile: DialogueNpcProfile,
  ): string {
    if (tree.entryRules) {
      for (const rule of tree.entryRules) {
        if (this.evaluateCondition(rule.condition, profile)) {
          return rule.nodeId;
        }
      }
    }
    return tree.defaultStartNodeId;
  }

  private getVisibleChoices(node: DialogueNode): DialogueChoiceNode[] {
    if (!node.choices || !this.activeProfile) return [];
    const profile = this.activeProfile;
    return node.choices.filter(
      (choice) => !choice.condition || this.evaluateCondition(choice.condition, profile),
    );
  }

  public evaluateCondition(
    cond: DialogueCondition,
    profile: DialogueNpcProfile,
  ): boolean {
    if (cond.questId && cond.questStatusIn) {
      const status = this.quests.getQuestStatus(cond.questId, this.bridge);
      if (!cond.questStatusIn.includes(status)) return false;
    }

    if (cond.hasItem) {
      const minCount = cond.hasItem.minCount ?? 1;
      if (this.bridge.getItemCount(cond.hasItem.itemId) < minCount) return false;
    }

    if (cond.missingItem) {
      const maxCount = cond.missingItem.maxCount ?? 0;
      if (this.bridge.getItemCount(cond.missingItem.itemId) > maxCount) return false;
    }

    if (cond.minCoins !== undefined && this.bridge.getCoins() < cond.minCoins) {
      return false;
    }

    if (cond.minDiscoveredLandmarks !== undefined) {
      if (this.bridge.getDiscoveredLandmarksCount() < cond.minDiscoveredLandmarks) {
        return false;
      }
    }

    if (cond.periodIn && !cond.periodIn.includes(profile.routinePeriod)) {
      return false;
    }

    if (cond.flagSet && !this.flags.has(cond.flagSet)) {
      return false;
    }

    if (cond.flagUnset && this.flags.has(cond.flagUnset)) {
      return false;
    }

    return true;
  }

  private applyEffects(effects: DialogueEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'startQuest':
          this.quests.acceptQuest(
            effect.questId,
            this.bridge,
            this.activeProfile?.npcId,
          );
          break;
        case 'completeQuest':
          this.quests.completeQuest(effect.questId, this.bridge, {
            consumeItem: this.bridge.consumeItem,
            giveItem: this.bridge.giveItem,
            grantRewards: this.bridge.grantRewards,
            notify: this.bridge.notify,
          });
          break;
        case 'giveItem':
          this.bridge.giveItem(effect.item);
          break;
        case 'consumeItem':
          this.bridge.consumeItem(effect.itemId, effect.count);
          break;
        case 'heal':
          this.bridge.healPlayer(effect.health ?? 0, effect.stamina ?? 0);
          break;
        case 'repairWeapons':
          this.bridge.repairWeapons(effect.costCoins ?? 0);
          break;
        case 'setFlag':
          this.flags.add(effect.flag);
          break;
        case 'notice':
          this.bridge.notify(effect.message);
          break;
      }
    }
  }

  private createFallbackTree(profile: DialogueNpcProfile): DialogueTree {
    const greeting =
      profile.fallbackGreeting ??
      (this.language === 'ar'
        ? `تحياتي أيها المسافر. أنا ${profile.name}.`
        : `Greetings, traveler. I am ${profile.name}.`);
    const choices = profile.fallbackChoices;
    if (!choices || choices.length === 0) {
      return {
        npcId: profile.npcId,
        defaultStartNodeId: 'fallback',
        nodes: {
          fallback: {
            id: 'fallback',
            lines: [greeting],
            nextNodeId: null,
          },
        },
      };
    }

    const nodes: Record<string, DialogueNode> = {
      fallback: {
        id: 'fallback',
        lines: [greeting],
        choices: choices.map((c) => ({
          id: c.id,
          label: c.label,
          nextNodeId: `reply_${c.id}`,
        })),
      },
    };

    for (const c of choices) {
      nodes[`reply_${c.id}`] = {
        id: `reply_${c.id}`,
        lines: [c.reply],
        nextNodeId: c.nextState === 'continue' ? 'fallback' : null,
      };
    }

    return {
      npcId: profile.npcId,
      defaultStartNodeId: 'fallback',
      nodes,
    };
  }
}
