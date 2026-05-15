export interface StepHubClientConfig {
  /** StepHub API base URL (e.g. https://api.stephubprotocol.xyz) */
  apiUrl: string;
  /** Your registered application client ID */
  clientId: string;
  /** Your registered application client secret */
  clientSecret: string;
  /** Request timeout in ms (default: 10000) */
  timeout?: number;
}

export type TrustTier = 'DIAMOND' | 'GOLD' | 'SILVER' | 'BRONZE' | 'WOOD';

export type Scope =
  | 'READ_STEPS'
  | 'READ_DISTANCE'
  | 'READ_TRUST_TIER'
  | 'READ_WORKOUTS'
  | 'READ_WORKOUT_HISTORY';

export type ConnectionStatus =
  | 'pending'
  | 'authorized'
  | 'rejected'
  | 'expired'
  /** Client-side only: the wait was aborted via an AbortSignal (never returned by the API) */
  | 'cancelled';

export interface CheckUserResponse {
  /** User exists in StepHub */
  exists: boolean;
  /** User has granted access to your app */
  hasAccess: boolean;
  /** Trust score 0-100 (requires READ_TRUST_TIER permission) */
  trustScore?: number;
  /** Trust tier (requires READ_TRUST_TIER permission) */
  trustTier?: TrustTier;
  /** Account age in days */
  accountAgeDays?: number;
  /** Total steps since this app was connected (requires READ_STEPS permission) */
  totalSteps?: number;
  /** Average daily steps last 30 days (requires READ_STEPS permission) */
  avgDailySteps?: number;
  /** Rank among all users */
  rank?: number;
  /** Total number of users */
  totalUsers?: number;
  /** Percentile ranking (0-100) */
  percentile?: number;
  /** Steps in the last 7 days */
  weeklySteps?: number;
  /** Weekly steps change percentage */
  weeklyDelta?: number;
  /** Whether data may be outdated */
  stale?: boolean;
  /** Last sync timestamp (ISO 8601) */
  lastSyncAt?: string;
  /** Currently granted permissions */
  permissions?: string[];
  /** Connection status (ACTIVE / REVOKED) */
  connectionStatus?: string;
}

export interface UserDataResponse {
  /** StepHub internal user ID (UUID) */
  userId: string;
  /** Data based on granted permissions */
  data: {
    /** Total steps since this app was connected (requires READ_STEPS permission) */
    steps?: number;
    /** Total distance in meters since this app was connected (requires READ_DISTANCE permission) */
    distance?: number;
    trustScore?: number;
    trustTier?: TrustTier;
    workouts?: {
      total: number;
      last7Days: number;
      last30Days: number;
      byType: Record<string, number>;
    };
  };
  /** Permissions that were used to fetch this data */
  usedPermissions: string[];
}

export interface ConnectionRequestOptions {
  /** Optional wallet address to associate with this connection request for wallet-aware partner flows */
  walletAddress?: string;
}

export interface ConnectionRequest {
  /** 6-character connection code (expires in 5 minutes) */
  connectionCode: string;
  /** Deep link for mobile app (stephub://connect?code=XXXXXX) */
  deeplink: string;
  /** QR code as a base64 SVG data URI */
  qrCode: string;
  /** Expiration timestamp (ISO 8601) */
  expiresAt: string;
  /** Request ID for polling status */
  requestId: string;
}

export interface ConnectionStatusResponse {
  /** Current status */
  status: ConnectionStatus;
  /** StepHub user ID (only when authorized) */
  userId?: string;
  /** Timestamp when connection was authorized (ISO 8601) */
  connectedAt?: string;
  /** Reason the connection was rejected */
  rejectedReason?: string;
  /** Human-readable rejection message */
  rejectedMessage?: string;
}

export interface StepHubProfileData {
  steps?: number;
  distance?: number;
  trustScore?: number;
  trustTier?: TrustTier;
  workouts?: {
    total: number;
    last7Days: number;
    last30Days: number;
    byType: Record<string, number>;
  };
}

export interface StepHubProfile extends StepHubProfileData {
  userId: string;
  usedPermissions: string[];
}

export interface StepHubAccess {
  exists: boolean;
  hasAccess: boolean;
  trustScore?: number;
  trustTier?: TrustTier;
  accountAgeDays?: number;
  totalSteps?: number;
  avgDailySteps?: number;
  rank?: number;
  totalUsers?: number;
  percentile?: number;
  weeklySteps?: number;
  weeklyDelta?: number;
  stale?: boolean;
  lastSyncAt?: string;
  permissions?: string[];
  connectionStatus?: string;
}

export interface StepHubConnection {
  connectionCode: string;
  deeplink: string;
  qrCode: string;
  expiresAt: string;
  requestId: string;
}

export interface StepHubStatsSummary {
  steps: number;
  distance: number;
  trustScore?: number;
  trustTier?: TrustTier;
  rank?: number;
  percentile?: number;
}

export interface StepHubUsersApi {
  getAccess(userId: string): Promise<StepHubAccess>;
  getProfile(userId: string, scopes: Scope[]): Promise<StepHubProfile>;
  getSummary(userId: string, scopes: Scope[]): Promise<StepHubUserSummary>;
  getSteps(userId: string): Promise<number>;
  getDistance(userId: string): Promise<number>;
  getTrust(userId: string): Promise<Pick<StepHubAccess, 'trustScore' | 'trustTier' | 'rank' | 'percentile'>>;
  getStats(userId: string): Promise<StepHubStatsSummary>;
  ensureAccess(userId: string): Promise<StepHubAccess>;
  /** Per-day activity breakdown (steps, distance, calories, flights) */
  getDailyStats(userId: string, options?: DailyStatsOptions): Promise<DailyStatsResponse>;
  /** Paginated workout history (requires READ_WORKOUT_HISTORY) */
  getWorkoutHistory(userId: string, options?: WorkoutHistoryOptions): Promise<WorkoutHistoryResponse>;
}

export interface StepHubConnectionsApi {
  start(externalUserId: string, permissions: Scope[], options?: ConnectionRequestOptions): Promise<StepHubConnection>;
  status(requestId: string): Promise<ConnectionStatusResponse>;
  wait(requestId: string, options?: WaitForConnectionOptions): Promise<ConnectionStatusResponse>;
  startAndWait(
    externalUserId: string,
    permissions: Scope[],
    options?: WaitForConnectionOptions & ConnectionRequestOptions,
  ): Promise<ConnectionStatusResponse>;
}

export interface StepHubAttestationsApi {
  /** Prepare Base/EVM EAS attestation data */
  prepare(userId: string): Promise<PrepareAttestationResponse>;
  /** Confirm Base/EVM EAS attestation after the on-chain tx is mined */
  confirm(userId: string, attestationUid: string, txHash: string): Promise<ConfirmAttestationResponse>;
}

export interface StepHubTonBadgesApi {
  /** Prepare a TON soulbound badge mint payload for TonConnect */
  prepare(userId: string, tonAddress: string): Promise<PrepareTonBadgeResponse>;
}

export interface StepHubErrorDetails {
  message: string;
  retryAfter?: number;
  raw?: unknown;
}

export interface WaitForConnectionOptions {
  /** Polling interval in ms (default: 2000) */
  intervalMs?: number;
  /** Max wait time in ms (default: 300000) */
  timeoutMs?: number;
  /** Optional abort signal */
  signal?: AbortSignal;
}

export interface StepHubUserSummary {
  access: StepHubAccess;
  profile: StepHubProfile;
}

// ── Nudge ──

export interface NudgeResponse {
  /** Whether the nudge was sent */
  nudged: boolean;
  /** Number of devices the nudge was sent to */
  devicesSent: number;
  /** Reason if nudge was not sent */
  reason?: 'rate_limited' | 'no_push_tokens';
  /** Seconds to wait before retrying */
  retryAfter?: number;
}

// ── Daily Stats ──

export interface DailyStatDay {
  /** Date (YYYY-MM-DD) */
  date: string;
  /** Steps count */
  steps: number;
  /** Distance in meters */
  distance: number;
  /** Active calories burned */
  activeKcal: number;
  /** Flights of stairs climbed */
  flights: number;
}

export interface DailyStatsOptions {
  /** Specific date (YYYY-MM-DD) */
  date?: string;
  /** Range start (YYYY-MM-DD) */
  startDate?: string;
  /** Range end (YYYY-MM-DD) */
  endDate?: string;
  /** Max number of days to return */
  limit?: number;
}

export interface DailyStatsResponse {
  /** StepHub user ID */
  userId: string;
  /** Daily stats entries */
  days: DailyStatDay[];
  /** Total number of days returned */
  totalDays: number;
  /** Start date of the range */
  startDate: string;
  /** End date of the range */
  endDate: string;
  /** Whether data may be outdated */
  stale?: boolean;
  /** Last sync timestamp (ISO 8601) */
  lastSyncAt?: string;
}

// ── Workout History ──

export interface WorkoutEntry {
  /** Workout type (e.g. "running", "walking", "cycling") */
  type: string;
  /** Start time (ISO 8601) */
  startTime: string;
  /** End time (ISO 8601) */
  endTime: string;
  /** Duration in seconds */
  duration: number;
  /** Distance in meters */
  distance: number;
  /** Energy burned in kcal */
  energy: number;
  /** Trust tier for this workout */
  tier: string;
}

export interface WorkoutPagination {
  /** Total number of workouts */
  total: number;
  /** Items per page */
  limit: number;
  /** Current offset */
  offset: number;
  /** Whether more items exist */
  hasMore: boolean;
}

export interface WorkoutHistoryOptions {
  /** Items per page (default: 20) */
  limit?: number;
  /** Offset for pagination (default: 0) */
  offset?: number;
}

export interface WorkoutHistoryResponse {
  /** StepHub user ID */
  userId: string;
  /** Workout entries */
  workouts: WorkoutEntry[];
  /** Pagination info */
  pagination: WorkoutPagination;
}

// ── Attestation ──

export interface PrepareAttestationResponse {
  /** Attestation request ID */
  id: string;
  /** EAS schema UID */
  schemaUid: string;
  /** EAS contract address */
  easContractAddress: string;
  /** Recipient wallet address */
  recipient: string;
  /** ABI-encoded attestation data */
  encodedData: string;
  /** Whether the attestation is revocable */
  revocable: boolean;
  /** Target chain ID */
  chainId: number;
  /** Existing attestation UID if updating */
  existingAttestationUid?: string;
  /** Fee for attestation in wei */
  attestFee: string;
  /** Referral transaction hash */
  referralTxHash?: string | null;
}

export interface ConfirmAttestationResponse {
  /** Whether the confirmation was successful */
  success: boolean;
  /** On-chain attestation UID */
  attestationUid: string;
  /** Link to view attestation on EAS scan */
  easScanUrl: string;
}

// ── TON Badge ──

export interface PrepareTonBadgeResponse {
  /** TON collection contract address — destination of the TonConnect transaction */
  collectionAddress: string;
  /** Total nano-TON the user must attach */
  amount: string;
  /** Base64-encoded BoC of the MintBadge body for TonConnect messages[].payload */
  payload: string;
  /** Trust score snapshot at prepare time (0-100) */
  trustScore: number;
  /** Trust tier snapshot */
  trustTier: TrustTier | string;
  /** Account age in days at prepare time */
  accountAgeDays: number;
  /** Deterministic future address of the soulbound badge item contract */
  expectedItemAddress: string;
  /** TonConnect transaction valid_until offset, in seconds */
  validUntilSeconds: number;
  /** Pending StepHub row ID for server-side tracking */
  pendingId: string;
  /** Referral registration transaction hash, or null if referral was skipped */
  referralTxHash?: string | null;
}
