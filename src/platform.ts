import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';

import {
  EG4AccessoryHandler,
  EG4BatteryAccessory,
  EG4GridAccessory,
  EG4LoadAccessory,
  EG4SolarAccessory,
  EG4GeneratorAccessory,
} from './accessories/splitAccessories.js';

import { EG4Client } from './eg4/client.js';
import { getSystemSnapshots } from './eg4/snapshot.js';
import { DEFAULT_BASE_URL, PLUGIN_VERSION } from './settings.js';

interface EG4PlatformConfig extends PlatformConfig {
  username?: string;
  password?: string;
  baseUrl?: string;
  allowCustomEndpoint?: boolean;
  allowInsecureLocalEndpoint?: boolean;
  debugApi?: boolean;
  demoMode?: boolean;
  pollInterval?: number;
  showBattery?: boolean;
  showGrid?: boolean;
  showSolar?: boolean;
  showLoad?: boolean;
  showGenerator?: boolean;
  missingDataBehavior?: 'show-na' | 'hide';
}

type AccessoryRole =
  | 'grid'
  | 'battery'
  | 'solar'
  | 'load'
  | 'generator';

interface AccessoryDefinition {
  role: AccessoryRole;
  name: string;
  model: string;
}

const ACCESSORY_DEFINITIONS: AccessoryDefinition[] = [
  {
    role: 'grid',
    name: 'EG4 Grid',
    model: 'EG4 Grid',
  },
  {
    role: 'battery',
    name: 'EG4 Battery',
    model: 'EG4 Battery',
  },
  {
    role: 'solar',
    name: 'EG4 Solar',
    model: 'EG4 Solar',
  },
  {
    role: 'load',
    name: 'EG4 House Load',
    model: 'EG4 House Load',
  },
  {
    role: 'generator',
    name: 'EG4 Generator',
    model: 'EG4 Generator',
  },
];

export class EG4Platform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: PlatformAccessory[] = [];

  private readonly handlers = new Map<
    string,
    EG4AccessoryHandler
  >();

  private client?: EG4Client;
  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor(
    public readonly log: Logging,
    private readonly config: EG4PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.log.info(
      `Initializing EG4 platform v${PLUGIN_VERSION}.`,
    );

    this.api.on('didFinishLaunching', () => {
      void this.start().catch((error) => {
        this.log.error(
          `EG4 startup failed: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        );
      });
    });

    this.api.on('shutdown', () => {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
      }
    });
  }

  configureAccessory(
    accessory: PlatformAccessory,
  ): void {
    this.accessories.push(accessory);
    this.log.debug(
      `Restored cached accessory: ${accessory.displayName}`,
    );
  }

  private async start(): Promise<void> {
    const demoMode =
      this.config.demoMode === true ||
      process.env.HOMEBRIDGE_EG4_DEMO === '1';

    if (!demoMode && (!this.config.username || !this.config.password)) {
      this.log.warn(
        'EG4 username/password are not configured. No API calls will be made.',
      );
      return;
    }

    if (demoMode) {
      this.log.warn(
        'EG4 development demo mode is enabled. Using the public EG4 guest demo session instead of account credentials.',
      );
    }

    this.client = new EG4Client({
      username: this.config.username ?? '',
      password: this.config.password ?? '',
      demoMode,
      baseUrl:
        this.config.baseUrl ?? DEFAULT_BASE_URL,
      allowCustomEndpoint:
        this.config.allowCustomEndpoint ?? false,
      allowInsecureLocalEndpoint:
        this.config.allowInsecureLocalEndpoint ?? false,
      debug: this.config.debugApi
        ? (message) => this.log.debug(message)
        : undefined,
    });

    await this.refresh();

    const pollIntervalSeconds = Math.max(
      60,
      Number(this.config.pollInterval ?? 120),
    );

    this.refreshTimer = setInterval(() => {
      void this.refresh();
    }, pollIntervalSeconds * 1000);

    this.log.info(
      `Polling EG4 every ${pollIntervalSeconds} seconds.`,
    );
  }

  private async refresh(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const snapshots = await getSystemSnapshots(
        this.client,
        (message) => this.log.debug(message),
      );

      const desiredAccessoryUuids = new Set<string>();

      for (const snapshot of snapshots) {
        const plantId = String(
          snapshot.plant.plantId ??
            snapshot.plant.id ??
            snapshot.plant.name,
        );
        const systemId = snapshot.systemId;

        this.removeLegacySystemAccessory(plantId);

        for (const definition of ACCESSORY_DEFINITIONS) {
          if (!this.isRoleEnabled(definition.role)) {
            this.removeAccessory(systemId, definition.role);
            continue;
          }

          const dataAvailable = this.hasDataForRole(
            snapshot,
            definition.role,
          );

          if (
            !dataAvailable &&
            this.config.missingDataBehavior === 'hide'
          ) {
            this.removeAccessory(systemId, definition.role);
            continue;
          }

          const accessoryUuid = this.api.hap.uuid.generate(
            `eg4-${definition.role}-${systemId}`,
          );
          desiredAccessoryUuids.add(accessoryUuid);

          const accessory = this.ensureAccessory(
            systemId,
            plantId,
            snapshot.plant.name ?? 'EG4',
            snapshot.systemLabel,
            snapshot.systemShortLabel,
            snapshot.multipleSystemsInPlant,
            definition,
          );

          const handler = this.ensureHandler(
            definition.role,
            accessory,
          );

          handler.update(snapshot);
        }
      }

      this.removeStaleAccessories(desiredAccessoryUuids);
    } catch (error) {
      this.log.error(
        `EG4 refresh failed: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  }

  private isRoleEnabled(role: AccessoryRole): boolean {
    switch (role) {
      case 'battery':
        return this.config.showBattery ?? true;
      case 'grid':
        return this.config.showGrid ?? true;
      case 'solar':
        return this.config.showSolar ?? true;
      case 'load':
        return this.config.showLoad ?? true;
      case 'generator':
        return this.config.showGenerator ?? true;
    }
  }

  private hasDataForRole(
    snapshot: Awaited<ReturnType<typeof getSystemSnapshots>>[number],
    role: AccessoryRole,
  ): boolean {
    return snapshot.metrics[role].available;
  }

  private removeAccessory(
    systemId: string,
    role: AccessoryRole,
  ): void {
    const uuid = this.api.hap.uuid.generate(
      `eg4-${role}-${systemId}`,
    );

    const accessory = this.accessories.find(
      (candidate) => candidate.UUID === uuid,
    );

    if (!accessory) {
      return;
    }

    this.api.unregisterPlatformAccessories(
      'homebridge-eg4',
      'EG4',
      [accessory],
    );

    const index = this.accessories.indexOf(accessory);
    if (index >= 0) {
      this.accessories.splice(index, 1);
    }

    this.handlers.delete(uuid);
    this.log.info(
      `Removed disabled/unavailable EG4 ${role} accessory.`,
    );
  }

  private ensureAccessory(
    systemId: string,
    plantId: string,
    plantName: string,
    systemLabel: string | undefined,
    systemShortLabel: string | undefined,
    multipleSystemsInPlant: boolean,
    definition: AccessoryDefinition,
  ): PlatformAccessory {
    const uuid = this.api.hap.uuid.generate(
      `eg4-${definition.role}-${systemId}`,
    );

    let accessory = this.accessories.find(
      (candidate) => candidate.UUID === uuid,
    );

    if (!accessory) {
      const baseName = definition.name.replace(/^EG4\s+/, '');
      const displayName =
        multipleSystemsInPlant && systemShortLabel
          ? `${systemShortLabel} ${baseName}`
          : definition.name;

      accessory = new this.api.platformAccessory(
        displayName,
        uuid,
      );

      accessory.context.systemId = systemId;
      accessory.context.plantId = plantId;
      accessory.context.plantName = plantName;
      accessory.context.systemLabel = systemLabel;
      accessory.context.systemShortLabel = systemShortLabel;
      accessory.context.multipleSystemsInPlant = multipleSystemsInPlant;
      accessory.context.role = definition.role;

      this.api.registerPlatformAccessories(
        'homebridge-eg4',
        'EG4',
        [accessory],
      );

      this.accessories.push(accessory);

      this.log.success(
        `Created HomeKit accessory: ${definition.name}.`,
      );
    }

    accessory.context.systemId = systemId;
    accessory.context.plantId = plantId;
    accessory.context.plantName = plantName;
    accessory.context.systemLabel = systemLabel;
    accessory.context.systemShortLabel = systemShortLabel;
    accessory.context.multipleSystemsInPlant = multipleSystemsInPlant;
    accessory.context.role = definition.role;

    return accessory;
  }

  private removeStaleAccessories(
    desiredAccessoryUuids: Set<string>,
  ): void {
    const stale = this.accessories.filter((accessory) => {
      const role = accessory.context.role as AccessoryRole | undefined;
      return (
        role !== undefined &&
        ACCESSORY_DEFINITIONS.some(
          (definition) => definition.role === role,
        ) &&
        !desiredAccessoryUuids.has(accessory.UUID)
      );
    });

    if (!stale.length) {
      return;
    }

    this.api.unregisterPlatformAccessories(
      'homebridge-eg4',
      'EG4',
      stale,
    );

    for (const accessory of stale) {
      const index = this.accessories.indexOf(accessory);
      if (index >= 0) {
        this.accessories.splice(index, 1);
      }
      this.handlers.delete(accessory.UUID);
    }

    this.log.info(
      `Removed ${stale.length} stale EG4 HomeKit accessor${stale.length === 1 ? 'y' : 'ies'} from systems no longer discovered.`,
    );
  }

  private ensureHandler(
    role: AccessoryRole,
    accessory: PlatformAccessory,
  ): EG4AccessoryHandler {
    const existing = this.handlers.get(accessory.UUID);

    if (existing) {
      return existing;
    }

    let handler: EG4AccessoryHandler;

    switch (role) {
      case 'grid':
        handler = new EG4GridAccessory(
          this,
          accessory,
        );
        break;

      case 'battery':
        handler = new EG4BatteryAccessory(
          this,
          accessory,
        );
        break;

      case 'solar':
        handler = new EG4SolarAccessory(
          this,
          accessory,
        );
        break;

      case 'load':
        handler = new EG4LoadAccessory(
          this,
          accessory,
        );
        break;

      case 'generator':
        handler = new EG4GeneratorAccessory(
          this,
          accessory,
        );
        break;
    }

    this.handlers.set(accessory.UUID, handler);
    return handler;
  }

  private removeLegacySystemAccessory(
    plantId: string,
  ): void {
    const legacyUuid = this.api.hap.uuid.generate(
      `eg4-system-${plantId}`,
    );

    const legacy = this.accessories.find(
      (candidate) => candidate.UUID === legacyUuid,
    );

    if (!legacy) {
      return;
    }

    this.api.unregisterPlatformAccessories(
      'homebridge-eg4',
      'EG4',
      [legacy],
    );

    const index = this.accessories.indexOf(legacy);

    if (index >= 0) {
      this.accessories.splice(index, 1);
    }

    this.handlers.delete(legacy.UUID);

    this.log.info(
      'Removed legacy single EG4 system accessory.',
    );
  }
}
