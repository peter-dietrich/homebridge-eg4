import type {
  API,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';

import { EG4Client } from './eg4/client.js';
import { discoverEG4 } from './eg4/discovery.js';
import { DEFAULT_BASE_URL } from './settings.js';

interface EG4PlatformConfig extends PlatformConfig {
  username?: string;
  password?: string;
  baseUrl?: string;
  debugApi?: boolean;
}

export class EG4Platform implements DynamicPlatformPlugin {
  private readonly accessories: PlatformAccessory[] = [];

  constructor(
    private readonly log: Logging,
    private readonly config: EG4PlatformConfig,
    private readonly api: API,
  ) {
    this.log.info('Initializing EG4 platform (v0.1 discovery-only).');

    this.api.on('didFinishLaunching', () => {
      void this.runDiscovery();
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    // v0.1 deliberately creates no accessories. Preserve anything cached so
    // later development versions do not unexpectedly remove HomeKit state.
    this.accessories.push(accessory);
    this.log.debug(`Restored cached accessory: ${accessory.displayName}`);
  }

  private async runDiscovery(): Promise<void> {
    if (!this.config.username || !this.config.password) {
      this.log.warn(
        'EG4 username/password are not configured. No API calls will be made.',
      );
      return;
    }

    const client = new EG4Client({
      username: this.config.username,
      password: this.config.password,
      baseUrl: this.config.baseUrl ?? DEFAULT_BASE_URL,
      debug: this.config.debugApi
        ? (message) => this.log.debug(message)
        : undefined,
    });

    try {
      const discovery = await discoverEG4(
        client,
        (message) => this.log.info(message),
      );

      const inverterCount = discovery.plants.reduce(
        (total, plant) => total + plant.inverterRuntime.length,
        0,
      );

      const midCount = discovery.plants.reduce(
        (total, plant) => total + plant.midRuntime.length,
        0,
      );

      this.log.success(
        `EG4 discovery complete: ${discovery.plants.length} plant(s), ` +
        `${inverterCount} inverter(s), ${midCount} GridBOSS/MID device(s).`,
      );

      this.log.info(
        'v0.1 is discovery-only; no HomeKit accessories have been created yet.',
      );
    } catch (error) {
      this.log.error(
        `EG4 discovery failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
