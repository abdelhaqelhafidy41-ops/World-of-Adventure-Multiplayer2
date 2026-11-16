import type { NpcRole } from '../types';
import { NPCBase, type NpcConfig } from './NPCBase';
import type { NpcSharedAssets } from './NpcRig';

export type SpecificNpcConfig = Omit<NpcConfig, 'role'>;

export class VillagerNPC extends NPCBase {
  constructor(config: SpecificNpcConfig, assets: NpcSharedAssets) {
    super({ ...config, role: 'villager', walkSpeed: config.walkSpeed ?? 2.15 }, assets);
  }
}

export class MerchantNPC extends NPCBase {
  public readonly shopName: string;

  constructor(
    config: SpecificNpcConfig & { shopName?: string },
    assets: NpcSharedAssets,
  ) {
    super({ ...config, role: 'merchant', walkSpeed: config.walkSpeed ?? 2.0 }, assets);
    this.shopName = config.shopName ?? config.title;
  }
}

export class FarmerNPC extends NPCBase {
  constructor(config: SpecificNpcConfig, assets: NpcSharedAssets) {
    super({ ...config, role: 'farmer', walkSpeed: config.walkSpeed ?? 2.1 }, assets);
  }
}

export class GuardNPC extends NPCBase {
  constructor(config: SpecificNpcConfig, assets: NpcSharedAssets) {
    super({ ...config, role: 'guard', walkSpeed: config.walkSpeed ?? 2.55 }, assets);
  }
}

export class BlacksmithNPC extends NPCBase {
  constructor(config: SpecificNpcConfig, assets: NpcSharedAssets) {
    super({ ...config, role: 'blacksmith', walkSpeed: config.walkSpeed ?? 2.05 }, assets);
  }
}

export class HunterNPC extends NPCBase {
  constructor(config: SpecificNpcConfig, assets: NpcSharedAssets) {
    super({ ...config, role: 'hunter', walkSpeed: config.walkSpeed ?? 2.45 }, assets);
  }
}

export class WoodcutterNPC extends NPCBase {
  constructor(config: SpecificNpcConfig, assets: NpcSharedAssets) {
    super({ ...config, role: 'woodcutter', walkSpeed: config.walkSpeed ?? 2.2 }, assets);
  }
}

export class FishermanNPC extends NPCBase {
  constructor(config: SpecificNpcConfig, assets: NpcSharedAssets) {
    super({ ...config, role: 'fisherman', walkSpeed: config.walkSpeed ?? 2.0 }, assets);
  }
}

export class HealerNPC extends NPCBase {
  constructor(config: SpecificNpcConfig, assets: NpcSharedAssets) {
    super({ ...config, role: 'healer', walkSpeed: config.walkSpeed ?? 2.1 }, assets);
  }
}

export class InnkeeperNPC extends NPCBase {
  constructor(config: SpecificNpcConfig, assets: NpcSharedAssets) {
    super({ ...config, role: 'innkeeper', walkSpeed: config.walkSpeed ?? 2.0 }, assets);
  }
}

export class CarpenterNPC extends NPCBase {
  constructor(config: SpecificNpcConfig, assets: NpcSharedAssets) {
    super({ ...config, role: 'carpenter', walkSpeed: config.walkSpeed ?? 2.15 }, assets);
  }
}

export class MinerNPC extends NPCBase {
  constructor(config: SpecificNpcConfig, assets: NpcSharedAssets) {
    super({ ...config, role: 'miner', walkSpeed: config.walkSpeed ?? 2.1 }, assets);
  }
}

export class ElderNPC extends NPCBase {
  constructor(config: SpecificNpcConfig, assets: NpcSharedAssets) {
    super({ ...config, role: 'elder', walkSpeed: config.walkSpeed ?? 1.85 }, assets);
  }
}

export class TravelingMerchantNPC extends NPCBase {
  constructor(config: SpecificNpcConfig, assets: NpcSharedAssets) {
    super({ ...config, role: 'traveling_merchant', walkSpeed: config.walkSpeed ?? 2.35 }, assets);
  }
}

export function createNpcByRole(
  config: NpcConfig,
  assets: NpcSharedAssets,
): NPCBase {
  const role: NpcRole = config.role;
  switch (role) {
    case 'merchant':
      return new MerchantNPC(config, assets);
    case 'farmer':
      return new FarmerNPC(config, assets);
    case 'guard':
      return new GuardNPC(config, assets);
    case 'blacksmith':
      return new BlacksmithNPC(config, assets);
    case 'hunter':
      return new HunterNPC(config, assets);
    case 'woodcutter':
      return new WoodcutterNPC(config, assets);
    case 'fisherman':
      return new FishermanNPC(config, assets);
    case 'healer':
      return new HealerNPC(config, assets);
    case 'innkeeper':
      return new InnkeeperNPC(config, assets);
    case 'carpenter':
      return new CarpenterNPC(config, assets);
    case 'miner':
      return new MinerNPC(config, assets);
    case 'elder':
      return new ElderNPC(config, assets);
    case 'traveling_merchant':
      return new TravelingMerchantNPC(config, assets);
    default:
      return new VillagerNPC(config, assets);
  }
}
