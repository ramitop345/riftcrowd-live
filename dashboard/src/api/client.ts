/**
 * Phase 13 — Typed API client for the RiftCrowd LIVE gateway.
 *
 * All mutations return { ok: true, data } | { ok: false, error, status }.
 * Token is read from VITE_SESSION_TOKEN env or localStorage override.
 */

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'riftcrowd_session_token';

export function getToken(): string {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  if (stored) return stored;
  return import.meta.env['VITE_SESSION_TOKEN'] ?? 'change-me';
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number };

// ---------------------------------------------------------------------------
// Fetch wrapper
// ---------------------------------------------------------------------------

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  try {
    const res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      let error = text;
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && 'error' in parsed) {
          error = String((parsed as { error: unknown }).error);
        }
      } catch {
        // Use raw text
      }
      return { ok: false, error, status: res.status };
    }

    const data = (await res.json()) as T;
    return { ok: true, data, status: res.status };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), status: 0 };
  }
}

function get<T>(path: string): Promise<ApiResult<T>> {
  return request<T>('GET', path);
}

function post<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  return request<T>('POST', path, body);
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: string;
  uptime: number;
  version: string;
  provider: string;
  timestamp: string;
}

export interface StatusResponse {
  pipeline: {
    eventsProcessed: number;
    commandsProduced: number;
    dropped: number;
    dedupeSize: number;
    rateLimitBuckets: number;
    commandQueueSize: number;
    commandQueueCapacity: number;
    eventBusSizes: Record<string, number>;
  };
  director: {
    state: string;
    timerSeconds: number;
    currentMode: string | null;
    paused: boolean;
  } | null;
  viewerRegistrySize: number;
  uptime: number;
}

export interface ConfigResponse {
  host: string;
  gatewayPort: number;
  gameWsPort: number;
  liveProvider: string;
  logLevel: string;
  shutdownTimeoutMs: number;
  pipeline: Record<string, number>;
  ws: Record<string, number>;
  localSessionToken: string;
}

export interface DirectorStateResponse {
  state: string;
  timerSeconds: number;
  currentMode: string | null;
  currentModeId: string | null;
  selectedFactions: Record<string, string>;
  stats: {
    roundsPlayed: number;
    modeCounts: Record<string, number>;
    factionWinCounts: Record<string, number>;
    recentModes: string[];
  };
  paused: boolean;
}

export interface MockStateResponse {
  running: boolean;
  connected: boolean;
  scenario: string | null;
  availableScenarios: string[];
  clockTimeMs: number;
  eventsEmitted: number;
  commandsProduced: number;
  pendingEvents: number;
  directorStates: string[];
  eventsInjected: number;
}

export interface MockInjectPayload {
  kind: 'comment' | 'gift';
  viewerId?: string;
  displayName?: string;
  comment?: string;
  giftId?: string;
  giftName?: string;
  providerValue?: number;
}

export interface MockInjectResponse {
  ok: boolean;
  eventId: string;
  commandTypes: string[];
  dropped: boolean;
  reason: string | null;
}

export interface OkResponse {
  ok: boolean;
  [key: string]: unknown;
}

export interface CommandsResponse {
  commands: unknown[];
  count: number;
}

export interface EventsResponse {
  raw_events: unknown[];
  normalized_events: unknown[];
  errors: unknown[];
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

// Health & status
export function getHealth(): Promise<ApiResult<HealthResponse>> {
  return get<HealthResponse>('/health');
}

export function getStatus(): Promise<ApiResult<StatusResponse>> {
  return get<StatusResponse>('/status');
}

// Config
export function getConfig(): Promise<ApiResult<ConfigResponse>> {
  return get<ConfigResponse>('/config');
}

export function updateConfig(
  patch: Record<string, unknown>,
): Promise<ApiResult<OkResponse>> {
  return post<OkResponse>('/config', patch);
}

// Director
export function getDirectorState(): Promise<ApiResult<DirectorStateResponse>> {
  return get<DirectorStateResponse>('/director/state');
}

export function skip(): Promise<ApiResult<OkResponse>> {
  return post<OkResponse>('/director/skip');
}

export function pause(): Promise<ApiResult<OkResponse>> {
  return post<OkResponse>('/director/pause');
}

export function resume(): Promise<ApiResult<OkResponse>> {
  return post<OkResponse>('/director/resume');
}

export function endRound(): Promise<ApiResult<OkResponse>> {
  return post<OkResponse>('/director/end');
}

export function restart(): Promise<ApiResult<OkResponse>> {
  return post<OkResponse>('/director/restart');
}

// Events & commands
export function postEvents(
  events: unknown[],
): Promise<ApiResult<{ processed: number; commands: number; dropped: number }>> {
  return post('/events', { events });
}

export function getEvents(): Promise<ApiResult<EventsResponse>> {
  return get<EventsResponse>('/events');
}

export function getCommands(): Promise<ApiResult<CommandsResponse>> {
  return get<CommandsResponse>('/commands');
}

// Shutdown
export function shutdown(): Promise<ApiResult<OkResponse>> {
  return post<OkResponse>('/control/shutdown');
}

// Phase 13 FIX 2: explicit command queue drain (POST /control/drain)
export interface DrainQueueResponse {
  ok: boolean;
  drained: number;
}

export function drainQueue(): Promise<ApiResult<DrainQueueResponse>> {
  return post<DrainQueueResponse>('/control/drain');
}

// Gift economy
export function getGiftConfig(): Promise<ApiResult<unknown>> {
  return get('/gifts/config');
}

export function updateGiftConfig(
  patch: unknown,
): Promise<ApiResult<OkResponse>> {
  return post<OkResponse>('/gifts/config', patch);
}

export function getGiftPreview(): Promise<ApiResult<{ mappings: unknown[] }>> {
  return get('/gifts/preview');
}

export function getGiftStats(): Promise<ApiResult<unknown>> {
  return get('/gifts/stats');
}

// Engagement
export function getEngagementConfig(): Promise<ApiResult<unknown>> {
  return get('/engagement/config');
}

export function updateEngagementConfig(
  patch: unknown,
): Promise<ApiResult<OkResponse>> {
  return post<OkResponse>('/engagement/config', patch);
}

export function getEngagementStats(): Promise<ApiResult<unknown>> {
  return get('/engagement/stats');
}

export function getTopContributors(): Promise<ApiResult<{ contributors: unknown[] }>> {
  return get('/engagement/top');
}

// Mock adapter
export function mockStart(
  scenario: string,
  speedMultiplier?: number,
): Promise<ApiResult<OkResponse>> {
  return post<OkResponse>('/mock/start', { scenario, speedMultiplier });
}

export function mockStop(): Promise<ApiResult<OkResponse>> {
  return post<OkResponse>('/mock/stop');
}

export function mockAdvance(ms: number): Promise<ApiResult<OkResponse>> {
  return post<OkResponse>('/mock/advance', { ms });
}

export function mockState(): Promise<ApiResult<MockStateResponse>> {
  return get<MockStateResponse>('/mock/state');
}

export function mockRecord(scenario: string): Promise<ApiResult<OkResponse>> {
  return post<OkResponse>('/mock/record', { scenario });
}

export function mockReplay(sessionPath: string): Promise<ApiResult<OkResponse>> {
  return post<OkResponse>('/mock/replay', { sessionPath });
}

export function mockInjectEvent(payload: MockInjectPayload): Promise<ApiResult<MockInjectResponse>> {
  return post<MockInjectResponse>('/mock/inject', payload);
}

// Viewer moderation
export function hideUser(viewerId: string): Promise<ApiResult<OkResponse>> {
  return post<OkResponse>('/viewer/hide', { viewerId });
}

// Phase 18: Version info
export interface VersionResponse {
  version: string;
  schemaVersion: number;
  nodeVersion: string;
  buildTime: string;
  godotVersion: string;
}

export function getVersion(): Promise<ApiResult<VersionResponse>> {
  return get<VersionResponse>('/version');
}
