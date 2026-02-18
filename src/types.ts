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

export type ConnectionStatus = 'pending' | 'authorized' | 'rejected' | 'expired';

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
  /** Total steps all time (requires READ_STEPS permission) */
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
  };
  /** Permissions that were used to fetch this data */
  usedPermissions: string[];
}

export interface ConnectionRequest {
  /** 6-character connection code (expires in 5 minutes) */
  connectionCode: string;
  /** Deep link for mobile app (stephub://connect?code=XXXXXX) */
  deeplink: string;
  /** QR code as base64 data URI (PNG) */
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

// ── Nudge ──

export interface NudgeResponse {
  /** Whether the nudge was sent */
  nudged: boolean;
  /** Number of devices the nudge was sent to */
  devicesSent: number;
  /** Reason if nudge was not sent */
  reason?: string;
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
