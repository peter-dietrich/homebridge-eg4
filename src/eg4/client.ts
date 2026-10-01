import {
  EG4ClientOptions,
  EG4DeviceListResponse,
  EG4EnergyInfo,
  EG4LoginResponse,
  EG4MidboxRuntime,
  EG4ParallelGroupResponse,
  EG4PlantListResponse,
  JsonObject,
} from './types.js';

import {
  DEFAULT_BASE_URL,
  OFFICIAL_EG4_HOST,
  PLUGIN_VERSION,
} from '../settings.js';

export class EG4Error extends Error {}
export class EG4AuthenticationError extends EG4Error {}
export class EG4ApiError extends EG4Error {}

interface ResponseDiagnostic {
  status: number;
  contentType: string;
}

export class EG4Client {
  private readonly username: string;
  private readonly password: string;
  private readonly baseUrl: string;
  private readonly allowCustomEndpoint: boolean;
  private readonly allowInsecureLocalEndpoint: boolean;
  private readonly debug?: (message: string) => void;

  // Native fetch() does not maintain browser cookies for us, so keep a small
  // in-memory cookie jar containing only name=value pairs returned by EG4.
  private readonly cookies = new Map<string, string>();

  constructor(options: EG4ClientOptions) {
    this.username = options.username;
    this.password = options.password;
    this.allowCustomEndpoint = options.allowCustomEndpoint ?? false;
    this.allowInsecureLocalEndpoint =
      options.allowInsecureLocalEndpoint ?? false;
    this.baseUrl = this.validateBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.debug = options.debug;
  }

  get endpoint(): string {
    return this.baseUrl;
  }

  async login(): Promise<EG4LoginResponse> {
    // Clear stale cookies before a fresh authentication attempt.
    this.cookies.clear();

    const response = await fetch(`${this.baseUrl}/WManage/api/login`, {
      method: 'POST',
      headers: this.headers(false),
      body: new URLSearchParams({
        account: this.username,
        password: this.password,
        language: 'ENGLISH',
      }),
    });

    this.captureCookies(response);

    const body = await this.readJson<EG4LoginResponse>(
      response,
      '/WManage/api/login',
    );

    if (!response.ok || body.success === false) {
      throw new EG4AuthenticationError(
        `EG4 login failed (HTTP ${response.status}).`,
      );
    }

    if (this.cookies.size === 0) {
      throw new EG4AuthenticationError(
        'EG4 login succeeded but did not return any session cookies.',
      );
    }

    this.logDebug(
      `Authenticated. Stored cookie names: ${[...this.cookies.keys()].join(', ')}`,
    );

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

  async getConfigDevices(
    plantId: string,
    targetSerialNum = '',
  ): Promise<EG4DeviceListResponse> {
    return this.postForm<EG4DeviceListResponse>(
      '/WManage/web/config/inverter/list',
      {
        page: '1',
        rows: '100',
        plantId,
        searchText: '',
        targetSerialNum,
      },
    );
  }

  async getParallelGroupDetails(
    serialNum: string,
  ): Promise<EG4ParallelGroupResponse> {
    return this.postForm<EG4ParallelGroupResponse>(
      '/WManage/api/inverterOverview/getParallelGroupDetails',
      { serialNum },
    );
  }

  async getMidboxRuntime(serialNum: string): Promise<EG4MidboxRuntime> {
    return this.postForm<EG4MidboxRuntime>(
      '/WManage/api/midbox/getMidboxRuntime',
      { serialNum },
    );
  }

  async getParallelEnergyInfo(
    serialNum: string,
  ): Promise<EG4EnergyInfo> {
    return this.postForm<EG4EnergyInfo>(
      '/WManage/api/inverter/getInverterEnergyInfoParallel',
      { serialNum },
    );
  }

  private async postForm<T extends JsonObject>(
    path: string,
    form: Record<string, string>,
    retryAuth = true,
  ): Promise<T> {
    if (this.cookies.size === 0) {
      await this.login();
    }

    this.logDebug(
      `POST ${path} formKeys=[${Object.keys(form).join(',')}]` +
      (form.plantId ? ` plantIdSuffix=${this.maskSuffix(form.plantId)}` : ''),
    );

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(true),
      body: new URLSearchParams(form),
    });

    this.captureCookies(response);

    if ((response.status === 401 || response.status === 403) && retryAuth) {
      this.logDebug('Session rejected; re-authenticating once.');
      await this.login();
      return this.postForm<T>(path, form, false);
    }

    const body = await this.readJson<T>(response, path);

    if (!response.ok) {
      throw new EG4ApiError(
        `EG4 API request failed for ${path} (HTTP ${response.status}).`,
      );
    }

    if ('success' in body && body.success === false) {
      throw new EG4ApiError(
        `EG4 API reported failure for ${path}.`,
      );
    }

    return body;
  }

  private headers(authenticated: boolean): HeadersInit {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': `homebridge-eg4/${PLUGIN_VERSION}`,
      'X-Requested-With': 'XMLHttpRequest',
      Origin: this.baseUrl,
      Referer: `${this.baseUrl}/WManage/`,
    };

    if (authenticated && this.cookies.size > 0) {
      headers.Cookie = [...this.cookies.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
    }

    return headers;
  }

  private captureCookies(response: Response): void {
    const headerObject = response.headers as Headers & {
      getSetCookie?: () => string[];
    };

    const setCookies =
      typeof headerObject.getSetCookie === 'function'
        ? headerObject.getSetCookie()
        : [response.headers.get('set-cookie') ?? ''];

    for (const rawCookie of setCookies) {
      if (!rawCookie) {
        continue;
      }

      // A Set-Cookie header starts with name=value followed by attributes.
      // getSetCookie() gives us individual headers on current Node versions.
      const firstPart = rawCookie.split(';', 1)[0] ?? '';
      const equalsIndex = firstPart.indexOf('=');

      if (equalsIndex <= 0) {
        continue;
      }

      const name = firstPart.slice(0, equalsIndex).trim();
      const value = firstPart.slice(equalsIndex + 1).trim();

      if (name && value) {
        this.cookies.set(name, value);
      }
    }
  }

  private async readJson<T>(
    response: Response,
    path: string,
  ): Promise<T> {
    const text = await response.text();

    try {
      return JSON.parse(text) as T;
    } catch {
      const diagnostic = this.makeDiagnostic(response, text);

      this.logDebug(
        `${path} returned non-JSON: HTTP=${diagnostic.status} ` +
        `contentType="${diagnostic.contentType}"`,
      );

      throw new EG4ApiError(
        `Expected JSON from EG4 for ${path} but received ` +
        `HTTP ${diagnostic.status} ${diagnostic.contentType || '(unknown content type)'}.`,
      );
    }
  }

  private makeDiagnostic(response: Response, _body: string): ResponseDiagnostic {
    return {
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
    };
  }

  private validateBaseUrl(value: string): string {
    let parsed: URL;

    try {
      parsed = new URL(value);
    } catch {
      throw new EG4ApiError('EG4 Monitor URL is invalid.');
    }

    const hostname = parsed.hostname.toLowerCase();
    const isOfficial = hostname === OFFICIAL_EG4_HOST;

    if (!isOfficial && !this.allowCustomEndpoint) {
      throw new EG4ApiError(
        `Custom EG4 endpoint "${hostname}" requires explicit opt-in.`,
      );
    }

    if (parsed.protocol !== 'https:') {
      const isLocalHttp =
        this.allowInsecureLocalEndpoint &&
        this.isPrivateOrLoopbackHost(hostname);

      if (!isLocalHttp) {
        throw new EG4ApiError(
          'EG4 Monitor URL must use HTTPS. Plain HTTP is allowed only for explicitly enabled private/loopback endpoints.',
        );
      }
    }

    if (isOfficial && parsed.port && parsed.port !== '443') {
      throw new EG4ApiError(
        'The official EG4 Monitor URL must use the standard HTTPS port.',
      );
    }

    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    parsed.search = '';

    const pathname = parsed.pathname.replace(/\/+$/, '');
    parsed.pathname =
      pathname && pathname !== '/'
        ? pathname
        : '';

    return parsed.toString().replace(/\/+$/, '');
  }

  private isPrivateOrLoopbackHost(hostname: string): boolean {
    if (hostname === 'localhost' || hostname === '::1') {
      return true;
    }

    if (/^127\./.test(hostname) || /^10\./.test(hostname)) {
      return true;
    }

    const match172 = hostname.match(/^172\.(\d{1,3})\./);
    if (match172) {
      const secondOctet = Number(match172[1]);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }

    if (/^192\.168\./.test(hostname)) {
      return true;
    }

    return hostname.endsWith('.local');
  }

  private maskSuffix(value: string): string {
    if (value.length <= 3) {
      return '***';
    }
    return `***${value.slice(-3)}`;
  }

  private logDebug(message: string): void {
    this.debug?.(message);
  }
}
