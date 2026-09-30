import {
  EG4BatteryInfo,
  EG4ClientOptions,
  EG4DeviceListResponse,
  EG4LoginResponse,
  EG4MidboxRuntime,
  EG4ParallelGroupResponse,
  EG4PlantListResponse,
  EG4Runtime,
  JsonObject,
} from './types.js';

import { DEFAULT_BASE_URL } from '../settings.js';

export class EG4Error extends Error {}
export class EG4AuthenticationError extends EG4Error {}
export class EG4ApiError extends EG4Error {}

export class EG4Client {
  private readonly username: string;
  private readonly password: string;
  private readonly baseUrl: string;
  private readonly debug?: (message: string) => void;

  private sessionId?: string;

  constructor(options: EG4ClientOptions) {
    this.username = options.username;
    this.password = options.password;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.debug = options.debug;
  }

  get endpoint(): string {
    return this.baseUrl;
  }

  async login(): Promise<EG4LoginResponse> {
    const response = await fetch(`${this.baseUrl}/WManage/api/login`, {
      method: 'POST',
      headers: this.headers(false),
      body: new URLSearchParams({
        account: this.username,
        password: this.password,
      }),
      redirect: 'manual',
    });

    const setCookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie') ?? ''];

    const cookieText = setCookies.join('; ');
    const sessionMatch = cookieText.match(/JSESSIONID=([^;,\s]+)/i);

    const body = await this.readJson<EG4LoginResponse>(response);

    if (!response.ok || body.success === false) {
      throw new EG4AuthenticationError(
        `EG4 login failed (HTTP ${response.status}).`,
      );
    }

    if (!sessionMatch?.[1]) {
      throw new EG4AuthenticationError(
        'EG4 login response did not contain a JSESSIONID session cookie.',
      );
    }

    this.sessionId = sessionMatch[1];
    this.logDebug('Authenticated and received EG4 session cookie.');

    return body;
  }

  async getPlants(): Promise<EG4PlantListResponse> {
    return this.postForm<EG4PlantListResponse>(
      '/WManage/web/config/plant/list/viewer',
      {
        sort: 'createDate',
        order: 'desc',
        searchText: '',
      },
    );
  }

  async getParallelGroups(plantId: string): Promise<EG4ParallelGroupResponse> {
    return this.postForm<EG4ParallelGroupResponse>(
      '/WManage/api/inverterOverview/getParallelGroupDetails',
      { plantId },
    );
  }

  async getDeviceOverview(plantId: string): Promise<EG4DeviceListResponse> {
    return this.postForm<EG4DeviceListResponse>(
      '/WManage/api/inverterOverview/list',
      { plantId },
    );
  }

  async getInverterRuntime(serialNum: string): Promise<EG4Runtime> {
    return this.postForm<EG4Runtime>(
      '/WManage/api/inverter/getInverterRuntime',
      { serialNum },
    );
  }

  async getBatteryInfo(serialNum: string): Promise<EG4BatteryInfo> {
    return this.postForm<EG4BatteryInfo>(
      '/WManage/api/battery/getBatteryInfo',
      { serialNum },
    );
  }

  async getMidboxRuntime(serialNum: string): Promise<EG4MidboxRuntime> {
    return this.postForm<EG4MidboxRuntime>(
      '/WManage/api/midbox/getMidboxRuntime',
      { serialNum },
    );
  }

  private async postForm<T extends JsonObject>(
    path: string,
    form: Record<string, string>,
    retryAuth = true,
  ): Promise<T> {
    if (!this.sessionId) {
      await this.login();
    }

    this.logDebug(`POST ${path}`);

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(true),
      body: new URLSearchParams(form),
    });

    if ((response.status === 401 || response.status === 403) && retryAuth) {
      this.logDebug('Session expired; re-authenticating once.');
      this.sessionId = undefined;
      await this.login();
      return this.postForm<T>(path, form, false);
    }

    const body = await this.readJson<T>(response);

    if (!response.ok) {
      throw new EG4ApiError(
        `EG4 API request failed for ${path} (HTTP ${response.status}).`,
      );
    }

    if ('success' in body && body.success === false) {
      throw new EG4ApiError(`EG4 API reported failure for ${path}.`);
    }

    return body;
  }

  private headers(authenticated: boolean): HeadersInit {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'homebridge-eg4/0.1.0-dev',
    };

    if (authenticated && this.sessionId) {
      headers.Cookie = `JSESSIONID=${this.sessionId}`;
    }

    return headers;
  }

  private async readJson<T>(response: Response): Promise<T> {
    const text = await response.text();

    try {
      return JSON.parse(text) as T;
    } catch {
      const sample = text.slice(0, 160).replace(/\s+/g, ' ');
      throw new EG4ApiError(
        `Expected JSON from EG4 but received a different response: ${sample}`,
      );
    }
  }

  private logDebug(message: string): void {
    this.debug?.(message);
  }
}
