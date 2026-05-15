import type {
  StepHubClientConfig,
  CheckUserResponse,
  UserDataResponse,
  ConnectionRequest,
  ConnectionStatusResponse,
  Scope,
  NudgeResponse,
  DailyStatsOptions,
  DailyStatsResponse,
  WorkoutHistoryOptions,
  WorkoutHistoryResponse,
  PrepareAttestationResponse,
  ConfirmAttestationResponse,
  PrepareTonBadgeResponse,
  ConnectionRequestOptions,
  WaitForConnectionOptions,
  StepHubUserSummary,
  StepHubAccess,
  StepHubProfile,
  StepHubConnection,
  StepHubUsersApi,
  StepHubConnectionsApi,
  StepHubAttestationsApi,
  StepHubTonBadgesApi,
  StepHubErrorDetails,
  StepHubStatsSummary,
} from './types';

/**
 * StepHub Partners API Client
 *
 * Provides typed access to the StepHub protocol for partner applications.
 * Authenticate with your clientId and clientSecret obtained from Web Hub.
 *
 * @example
 * ```typescript
 * const stephub = new StepHubClient({
 *   apiUrl: 'https://api.stephubprotocol.xyz',
 *   clientId: 'your_app_id',
 *   clientSecret: 'your_secret',
 * });
 *
 * const user = await stephub.checkUser('telegram_12345');
 * if (user.hasAccess) {
 *   const data = await stephub.getUserData('telegram_12345', ['READ_STEPS']);
 *   console.log(data.data.steps);
 * }
 * ```
 */
export class StepHubClient {
  private readonly apiUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly timeout: number;

  readonly users: StepHubUsersApi;
  readonly connections: StepHubConnectionsApi;
  readonly attestations: StepHubAttestationsApi;
  readonly tonBadges: StepHubTonBadgesApi;

  constructor(config: StepHubClientConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.timeout = config.timeout ?? 10_000;

    this.users = {
      getAccess: (userId) => this.getAccess(userId),
      getProfile: (userId, scopes) => this.getProfile(userId, scopes),
      getSummary: (userId, scopes) => this.getUserSummary(userId, scopes),
      getSteps: (userId) => this.getSteps(userId),
      getDistance: (userId) => this.getDistance(userId),
      getTrust: (userId) => this.getTrust(userId),
      getStats: (userId) => this.getStats(userId),
      ensureAccess: (userId) => this.ensureAccess(userId),
      getDailyStats: (userId, options) => this.getDailyStats(userId, options),
      getWorkoutHistory: (userId, options) => this.getWorkoutHistory(userId, options),
    };

    this.connections = {
      start: (externalUserId, permissions, options) =>
        this.connectUser(externalUserId, permissions, options),
      status: (requestId) => this.getConnectionStatus(requestId),
      wait: (requestId, options) => this.waitForAuthorization(requestId, options),
      startAndWait: (externalUserId, permissions, options) =>
        this.startAndWaitForConnection(externalUserId, permissions, options),
    };

    this.attestations = {
      prepare: (userId) => this.prepareAttestation(userId),
      confirm: (userId, attestationUid, txHash) =>
        this.confirmAttestation(userId, attestationUid, txHash),
    };

    this.tonBadges = {
      prepare: (userId, tonAddress) => this.prepareTonBadge(userId, tonAddress),
    };
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Client-Id': this.clientId,
      'X-Client-Secret': this.clientSecret,
    };
  }

  private buildQuery(params: Record<string, string | number | undefined>): string {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '';
    return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.apiUrl}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { ...this.headers, ...init?.headers },
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (error) {
      throw new StepHubError(
        `StepHub API request failed: ${error instanceof Error ? error.message : 'network error'}`,
        0,
        '',
        error,
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new StepHubError(
        `StepHub API error: ${response.status} ${response.statusText}`,
        response.status,
        body,
      );
    }

    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new StepHubError(
        `StepHub API returned invalid JSON`,
        response.status,
        text,
      );
    }
  }

  // ── Partners API ──

  /**
   * Check if a user exists and has granted access to your application.
   *
   * Returns user stats (steps, trust tier, rank) based on granted permissions.
   * If the user hasn't connected yet, `hasAccess` will be `false`.
   *
   * @param userId - External user ID (e.g. "telegram_12345", "farcaster_6841")
   */
  async checkUser(userId: string): Promise<CheckUserResponse> {
    const query = this.buildQuery({ userId });
    return this.request(`/api/v1/partners/check-user${query}`);
  }

  /**
   * Get user data filtered by scopes.
   *
   * Only returns data for permissions the user has granted.
   * Throws 403 if requesting scopes the user hasn't approved.
   *
   * @param userId - External user ID
   * @param scopes - Array of requested scopes
   */
  async getUserData(userId: string, scopes: Scope[]): Promise<UserDataResponse> {
    const query = this.buildQuery({ userId, scopes: scopes.join(',') });
    return this.request(`/api/v1/partners/user-data${query}`);
  }

  /**
   * Get daily activity stats for a user.
   *
   * Returns step counts, distance, calories, and flights per day.
   * Supports filtering by date range.
   *
   * @param userId - External user ID
   * @param options - Optional date range and limit filters
   */
  async getDailyStats(userId: string, options?: DailyStatsOptions): Promise<DailyStatsResponse> {
    const query = this.buildQuery({ userId, ...options });
    return this.request(`/api/v1/partners/daily-stats${query}`);
  }

  /**
   * Get workout history for a user.
   *
   * Returns paginated workout entries with type, duration, distance, and energy.
   * Requires `READ_WORKOUT_HISTORY` scope.
   *
   * @param userId - External user ID
   * @param options - Optional pagination (limit, offset)
   */
  async getWorkoutHistory(userId: string, options?: WorkoutHistoryOptions): Promise<WorkoutHistoryResponse> {
    const query = this.buildQuery({ userId, ...options });
    return this.request(`/api/v1/partners/workout-history${query}`);
  }

  /**
   * Send a nudge to a user's device to sync fresh data.
   *
   * Use when you need up-to-date data and `stale` is `true`.
   * Respects rate limits — check `retryAfter` if `nudged` is `false`.
   *
   * @param userId - External user ID
   */
  async nudge(userId: string): Promise<NudgeResponse> {
    return this.request('/api/v1/partners/nudge', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  /**
   * Prepare an on-chain attestation for a user's physical activity.
   *
   * Returns EAS-compatible data ready to be submitted as a transaction.
   * Call `confirmAttestation()` after the transaction is mined.
   *
   * @param userId - External user ID
   */
  async prepareAttestation(userId: string): Promise<PrepareAttestationResponse> {
    return this.request('/api/v1/partners/attestation/prepare', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  /**
   * Confirm an on-chain attestation after the transaction is mined.
   *
   * @param userId - External user ID
   * @param attestationUid - Attestation UID from the on-chain transaction
   * @param txHash - Transaction hash of the attestation
   */
  async confirmAttestation(
    userId: string,
    attestationUid: string,
    txHash: string,
  ): Promise<ConfirmAttestationResponse> {
    return this.request('/api/v1/partners/attestation/confirm', {
      method: 'POST',
      body: JSON.stringify({ userId, attestationUid, txHash }),
    });
  }

  async prepareTonBadge(
    userId: string,
    tonAddress: string,
  ): Promise<PrepareTonBadgeResponse> {
    return this.request('/api/v1/partners/ton-badge/prepare', {
      method: 'POST',
      body: JSON.stringify({ userId, tonAddress }),
    });
  }

  // ── Connections API ──

  /**
   * Request a connection code for a user to link their mobile device.
   *
   * Returns a 6-character code, QR code image, and deep link.
   * The code expires in 5 minutes. Poll `getConnectionStatus()` to check
   * if the user has scanned and authorized the connection.
   *
   * @param externalUserId - Your platform's user ID (e.g. "telegram_12345")
   * @param permissions - Requested permissions (e.g. ["READ_STEPS", "READ_TRUST_TIER"])
   */
  async requestConnection(
    externalUserId: string,
    permissions: Scope[],
    options?: ConnectionRequestOptions,
  ): Promise<ConnectionRequest> {
    return this.request('/api/v1/connections/request', {
      method: 'POST',
      body: JSON.stringify({
        externalUserId,
        permissions,
        ...(options?.walletAddress ? { walletAddress: options.walletAddress } : {}),
      }),
    });
  }

  /**
   * Poll the status of a connection request.
   *
   * Returns `pending` while waiting, `authorized` once the user has approved,
   * `rejected` if denied, or `expired` after 5 minutes.
   *
   * @param requestId - Request ID from `requestConnection()` response
   */
  async getConnectionStatus(requestId: string): Promise<ConnectionStatusResponse> {
    return this.request(
      `/api/v1/connections/status/${encodeURIComponent(requestId)}`,
    );
  }

  async waitForConnection(
    requestId: string,
    intervalMsOrOptions: number | WaitForConnectionOptions = 2000,
    timeoutMs = 300_000,
    signal?: AbortSignal,
  ): Promise<ConnectionStatusResponse> {
    const options =
      typeof intervalMsOrOptions === 'number'
        ? { intervalMs: intervalMsOrOptions, timeoutMs, signal }
        : intervalMsOrOptions;

    const intervalMs = options.intervalMs ?? 2000;
    const maxWaitMs = options.timeoutMs ?? 300_000;
    const abortSignal = options.signal;
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      if (abortSignal?.aborted) {
        return { status: 'cancelled' };
      }

      const status = await this.getConnectionStatus(requestId);

      if (status.status !== 'pending') {
        return status;
      }

      await new Promise((resolve) => {
        const timer = setTimeout(resolve, intervalMs);
        abortSignal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            resolve(undefined);
          },
          { once: true },
        );
      });
    }

    return { status: 'expired' };
  }

  // ── Convenience aliases ──

  async getAccess(userId: string): Promise<StepHubAccess> {
    return this.checkUser(userId);
  }

  async getProfile(userId: string, scopes: Scope[]): Promise<StepHubProfile> {
    const response = await this.getUserData(userId, scopes);
    return {
      userId: response.userId,
      usedPermissions: response.usedPermissions,
      ...response.data,
    };
  }

  async connectUser(
    externalUserId: string,
    permissions: Scope[],
    options?: ConnectionRequestOptions,
  ): Promise<StepHubConnection> {
    return this.requestConnection(externalUserId, permissions, options);
  }

  async waitForAuthorization(
    requestId: string,
    options?: WaitForConnectionOptions,
  ): Promise<ConnectionStatusResponse> {
    return this.waitForConnection(requestId, options ?? {});
  }

  async startAndWaitForConnection(
    externalUserId: string,
    permissions: Scope[],
    options?: WaitForConnectionOptions & ConnectionRequestOptions,
  ): Promise<ConnectionStatusResponse> {
    const { walletAddress, ...waitOptions } = options ?? {};
    const connection = await this.connectUser(externalUserId, permissions, { walletAddress });
    return this.waitForAuthorization(connection.requestId, waitOptions);
  }

  async getUserSummary(userId: string, scopes: Scope[]): Promise<StepHubUserSummary> {
    const [access, profile] = await Promise.all([
      this.getAccess(userId),
      this.getProfile(userId, scopes),
    ]);

    return { access, profile };
  }

  async getSteps(userId: string): Promise<number> {
    const profile = await this.getProfile(userId, ['READ_STEPS']);
    return profile.steps ?? 0;
  }

  async getDistance(userId: string): Promise<number> {
    const profile = await this.getProfile(userId, ['READ_DISTANCE']);
    return profile.distance ?? 0;
  }

  async getTrust(userId: string): Promise<Pick<StepHubAccess, 'trustScore' | 'trustTier' | 'rank' | 'percentile'>> {
    const access = await this.getAccess(userId);
    return {
      trustScore: access.trustScore,
      trustTier: access.trustTier,
      rank: access.rank,
      percentile: access.percentile,
    };
  }

  async getStats(userId: string): Promise<StepHubStatsSummary> {
    const [steps, distance, trust] = await Promise.all([
      this.getSteps(userId),
      this.getDistance(userId),
      this.getTrust(userId),
    ]);

    return {
      steps,
      distance,
      trustScore: trust.trustScore,
      trustTier: trust.trustTier,
      rank: trust.rank,
      percentile: trust.percentile,
    };
  }

  async ensureAccess(userId: string): Promise<StepHubAccess> {
    const access = await this.getAccess(userId);

    if (!access.exists) {
      throw new StepHubError('StepHub user not found', 404, 'user not found');
    }

    if (!access.hasAccess) {
      throw new StepHubError('User has not granted access to this application', 403, 'access not granted');
    }

    return access;
  }
}

/**
 * Error thrown by StepHub API calls
 */
export class StepHubError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StepHubError';
  }

  isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  isForbidden(): boolean {
    return this.statusCode === 403;
  }

  isNotFound(): boolean {
    return this.statusCode === 404;
  }

  isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  details(): StepHubErrorDetails {
    let raw: unknown;
    try {
      raw = JSON.parse(this.responseBody);
    } catch {
      raw = undefined;
    }

    const retryAfter =
      raw && typeof raw === 'object' && 'retryAfter' in raw && typeof raw.retryAfter === 'number'
        ? raw.retryAfter
        : undefined;

    return {
      message: this.message,
      retryAfter,
      raw,
    };
  }
}
