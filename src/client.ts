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

  constructor(config: StepHubClientConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.timeout = config.timeout ?? 10_000;
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

    const response = await fetch(url, {
      ...init,
      headers: { ...this.headers, ...init?.headers },
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new StepHubError(
        `StepHub API error: ${response.status} ${response.statusText}`,
        response.status,
        body,
      );
    }

    return response.json();
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
  ): Promise<ConnectionRequest> {
    return this.request('/api/v1/connections/request', {
      method: 'POST',
      body: JSON.stringify({ externalUserId, permissions }),
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

  /**
   * Wait for a connection to be authorized (with polling).
   *
   * Polls every `intervalMs` until the connection is authorized or expires.
   * Returns the final status.
   *
   * @param requestId - Request ID from `requestConnection()` response
   * @param intervalMs - Polling interval in ms (default: 2000)
   * @param timeoutMs - Max wait time in ms (default: 300000 = 5 min)
   */
  async waitForConnection(
    requestId: string,
    intervalMs = 2000,
    timeoutMs = 300_000,
  ): Promise<ConnectionStatusResponse> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const status = await this.getConnectionStatus(requestId);

      if (status.status !== 'pending') {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return { status: 'expired' };
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
  ) {
    super(message);
    this.name = 'StepHubError';
  }
}
