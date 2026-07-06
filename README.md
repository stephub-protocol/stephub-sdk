# @stephub/partner-sdk

TypeScript SDK for the **StepHub Partners API** — integrate verified physical activity data into your application.

## Install

```bash
npm install @stephub/partner-sdk
```

## Quick Start

```typescript
import { StepHubClient } from '@stephub/partner-sdk';

const stephub = new StepHubClient({
  apiUrl: 'https://api.stephubprotocol.xyz',
  clientId: 'your_app_id',
  clientSecret: 'your_secret',
});

// Namespaced API is the easiest entrypoint
const access = await stephub.users.getAccess('telegram_12345');
console.log(access.hasAccess);
console.log(access.trustTier);

const profile = await stephub.users.getProfile('telegram_12345', [
  'READ_STEPS',
  'READ_TRUST_TIER',
]);
console.log(profile.steps);
console.log(profile.trustTier);

const summary = await stephub.users.getSummary('telegram_12345', [
  'READ_STEPS',
  'READ_TRUST_TIER',
]);
console.log(summary.access.percentile);
console.log(summary.profile.steps);

const stats = await stephub.users.getStats('telegram_12345');
console.log(stats.steps);
console.log(stats.distance);
console.log(stats.trustTier);
```

## Privacy Boundary

All step and distance data returned by the API is scoped to the period **since the user connected to your specific app** — not the user's all-time lifetime total.

| Field | Endpoint | What it contains |
|-------|----------|-----------------|
| `totalSteps` | `checkUser` | Steps since this app was connected |
| `avgDailySteps` | `checkUser` | Avg steps/day over the last 30 days (bounded by connection date) |
| `weeklySteps` | `checkUser` | Steps in the current Mon–Sun week (bounded by connection date) |
| `data.steps` | `getUserData` | Steps since this app was connected |
| `data.distance` | `getUserData` | Distance in meters since this app was connected |
| `days[].steps` | `getDailyStats` | Steps for that specific calendar day |

For per-day breakdown use `getDailyStats` — it returns individual days so you can sum any range you need.

## Connection Flow

When a user hasn't connected their StepHub mobile app yet:

```typescript
// Start a connection and wait for the result in one call
const status = await stephub.connections.startAndWait(
  'telegram_12345',
  ['READ_STEPS', 'READ_TRUST_TIER'],
  { intervalMs: 2000, timeoutMs: 300000 },
);

// Wallet-aware partner flows can attach an optional wallet address to the request.
const walletAwareConnection = await stephub.connections.start(
  'farcaster_6841',
  ['READ_STEPS', 'READ_TRUST_TIER'],
  { walletAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e' },
);

if (status.status === 'authorized') {
  console.log('Connected! User ID:', status.userId);
}
```

Possible `status.status` values: `pending`, `authorized`, `rejected`, `expired`, and
`cancelled` — the last is returned **only** by the SDK when the wait is aborted via an
`AbortSignal`, so you can distinguish a user-driven cancel from a server-side timeout
(`expired`). When the status is `rejected`, the response may also carry `rejectedReason`
and a human-readable `rejectedMessage`.

## Daily Stats & Workout History

```typescript
// Get daily activity stats (last 7 days)
const stats = await stephub.users.getDailyStats('telegram_12345', {
  startDate: '2026-02-11',
  endDate: '2026-02-18',
});

for (const day of stats.days) {
  console.log(`${day.date}: ${day.steps} steps, ${day.distance}m, ${day.activeKcal} kcal`);
}

// Get workout history (paginated)
const workouts = await stephub.users.getWorkoutHistory('telegram_12345', {
  limit: 10,
  offset: 0,
});

for (const w of workouts.workouts) {
  console.log(`${w.type}: ${w.duration}s, ${w.distance}m (${w.tier})`);
}
console.log(`Total: ${workouts.pagination.total}, hasMore: ${workouts.pagination.hasMore}`);
```

## Nudge (Sync Fresh Data)

```typescript
const user = await stephub.checkUser('telegram_12345');

if (user.stale) {
  const nudge = await stephub.nudge('telegram_12345');
  if (nudge.nudged) {
    console.log(`Nudge sent to ${nudge.devicesSent} device(s)`);
  } else {
    console.log(`Cannot nudge: ${nudge.reason}, retry after ${nudge.retryAfter}s`);
  }
}
```

## On-Chain Proofs

### Base/EVM Attestation

Create verifiable on-chain proofs of physical activity using EAS (Ethereum Attestation Service):

```typescript
// 1. Prepare attestation data
const attestation = await stephub.prepareAttestation('telegram_12345');

console.log(attestation.schemaUid);          // EAS schema UID
console.log(attestation.easContractAddress); // EAS contract address
console.log(attestation.encodedData);        // ABI-encoded data
console.log(attestation.chainId);            // Target chain ID
console.log(attestation.attestFee);          // Fee in wei

// 2. Submit transaction on-chain using your web3 library
// const tx = await easContract.attest({ ... attestation data ... });
// const receipt = await tx.wait();

// 3. Confirm attestation with StepHub
const confirmed = await stephub.confirmAttestation(
  'telegram_12345',
  'attestation-uid-from-tx',
  '0xTransactionHash...',
);

console.log(confirmed.success);        // true
console.log(confirmed.attestationUid); // On-chain attestation UID
console.log(confirmed.easScanUrl);     // Link to view on EAS scan
```

### TON Badge

Prepare a TonConnect-ready soulbound badge mint payload for a user's TON wallet:

```typescript
const badge = await stephub.tonBadges.prepare(
  'telegram_12345',
  'UQAol-7LDQ-Pt0G0xsut1vvgBikCiTrx9QCyyPif4QTRJgRf',
);

console.log(badge.collectionAddress);   // TON collection destination
console.log(badge.amount);              // nano-TON amount to attach
console.log(badge.payload);             // base64 BoC for messages[].payload
console.log(badge.expectedItemAddress); // deterministic soulbound badge address

// Forward into TonConnect from your app:
// messages: [{ address: badge.collectionAddress, amount: badge.amount, payload: badge.payload }]
```

## API Reference

### `new StepHubClient(config)`

| Option | Type | Description |
|--------|------|-------------|
| `apiUrl` | `string` | StepHub API base URL (`https://api.stephubprotocol.xyz`) |
| `clientId` | `string` | Your app's client ID |
| `clientSecret` | `string` | Your app's client secret |
| `timeout` | `number` | Request timeout in ms (default: 10000) |

### Methods

| Method | Description |
|--------|-------------|
| `users.getAccess(userId)` | Check if user exists and has granted access |
| `users.ensureAccess(userId)` | Throw a typed SDK error if the user is missing or not connected |
| `users.getProfile(userId, scopes)` | Get a flattened profile shape for normal app usage |
| `users.getSummary(userId, scopes)` | Fetch access + profile together |
| `users.getSteps(userId)` | Get just the user's steps |
| `users.getDistance(userId)` | Get just the user's distance |
| `users.getTrust(userId)` | Get trust score / tier / rank summary |
| `users.getStats(userId)` | Get steps + distance + trust summary in one call |
| `users.getDailyStats(userId, options?)` | Per-day activity breakdown (steps, distance, calories, flights) |
| `users.getWorkoutHistory(userId, options?)` | Paginated workout history (requires `READ_WORKOUT_HISTORY`) |
| `connections.start(externalUserId, permissions, options?)` | Request a connection code (QR + deeplink); optional `walletAddress` for wallet-aware flows |
| `connections.status(requestId)` | Poll connection status |
| `connections.wait(requestId, options?)` | Poll until authorized or expired |
| `connections.startAndWait(externalUserId, permissions, options?)` | Start a connection flow and wait for the final status; accepts wait options and optional `walletAddress` |
| `attestations.prepare(userId)` | Prepare Base/EVM EAS attestation data |
| `attestations.confirm(userId, attestationUid, txHash)` | Confirm Base/EVM attestation after on-chain tx |
| `tonBadges.prepare(userId, tonAddress)` | Prepare TON soulbound badge mint payload for TonConnect |
| `requestConnection(externalUserId, permissions, options?)` | `POST /api/v1/connections/request`, including optional `walletAddress` |
| Raw methods (`checkUser`, `getUserData`, `prepareTonBadge`, ...) | Still available for lower-level usage |

### Scopes

| Scope | Description |
|-------|-------------|
| `READ_STEPS` | Access step count data |
| `READ_DISTANCE` | Access distance data |
| `READ_TRUST_TIER` | Access trust score and tier |
| `READ_WORKOUTS` | Access workout summary |
| `READ_WORKOUT_HISTORY` | Access detailed workout history |

## Webhooks

Instead of (or in addition to) polling `connections.status()`, the StepHub backend can
deliver connection lifecycle events to a webhook endpoint registered for your app:

| Event | When it fires |
|-------|---------------|
| `connection.authorized` | The user approved the connection in the mobile app |
| `connection.revoked` | The user revoked your app's access |

Every delivery is signed: the `X-StepHub-Signature` header contains an **HMAC-SHA256**
signature of the raw request body, keyed with your `clientSecret`. Verify it by
recomputing the HMAC over the raw (unparsed) body with your `clientSecret` and comparing
it to the header value before trusting the payload.

The SDK currently does not ship a webhook verification helper — handle verification in
your HTTP layer.

## Error Handling

`StepHubError` is exported and can be used with `instanceof`:

```typescript
import { StepHubClient, StepHubError } from '@stephub/partner-sdk';

try {
  const profile = await stephub.users.getProfile('telegram_12345', ['READ_STEPS']);
  console.log(profile.steps);
} catch (error) {
  if (error instanceof StepHubError) {
    if (error.isForbidden()) {
      console.error('User has not granted the required scopes yet');
    }

    if (error.isRateLimited()) {
      console.error(error.details().retryAfter);
    }
  }
}
```

| Status | Meaning |
|--------|---------|
| 401 | Invalid clientId / clientSecret |
| 403 | User hasn't granted the requested scope |
| 404 | User not found or not connected |
| 429 | Rate limited (check `retryAfter`) |
| 0 | Network failure or request timeout before an HTTP response was received |

## Requirements

- Node.js >= 18 (uses native `fetch`)
- Register your app at [StepHub Web Hub](https://stephubprotocol.xyz) to get API keys
