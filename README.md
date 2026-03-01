# @stephubprotocol/partner-sdk

TypeScript SDK for the **StepHub Partners API** — integrate verified physical activity data into your application.

## Install

```bash
npm install @stephubprotocol/partner-sdk
```

## Quick Start

```typescript
import { StepHubClient } from '@stephubprotocol/partner-sdk';

const stephub = new StepHubClient({
  apiUrl: 'https://api.stephubprotocol.xyz',
  clientId: 'your_app_id',
  clientSecret: 'your_secret',
});

// Check if user exists and has access
const user = await stephub.checkUser('telegram_12345');
console.log(user.hasAccess);    // true
console.log(user.trustTier);    // 'GOLD'
console.log(user.totalSteps);   // steps since this app connected (not lifetime total)
console.log(user.percentile);   // 85

// Get detailed data — response is nested: { userId, data: { ... }, usedPermissions }
const result = await stephub.getUserData('telegram_12345', ['READ_STEPS', 'READ_TRUST_TIER']);
console.log(result.data.steps);      // steps since this app connected (not lifetime total)
console.log(result.data.trustTier);  // 'GOLD'
console.log(result.usedPermissions); // ['READ_STEPS', 'READ_TRUST_TIER']
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
// 1. Request a connection code
const conn = await stephub.requestConnection('telegram_12345', [
  'READ_STEPS',
  'READ_TRUST_TIER',
]);

// 2. Show QR code to user
console.log(conn.qrCode);        // base64 PNG data URI
console.log(conn.connectionCode); // "A5B9C2" (6-char code)
console.log(conn.deeplink);       // "stephub://connect?code=A5B9C2"

// 3. Wait for user to scan and authorize
const status = await stephub.waitForConnection(conn.requestId);

if (status.status === 'authorized') {
  console.log('Connected! User ID:', status.userId);
}
```

## Daily Stats & Workout History

```typescript
// Get daily activity stats (last 7 days)
const stats = await stephub.getDailyStats('telegram_12345', {
  startDate: '2026-02-11',
  endDate: '2026-02-18',
});

for (const day of stats.days) {
  console.log(`${day.date}: ${day.steps} steps, ${day.distance}m, ${day.activeKcal} kcal`);
}

// Get workout history (paginated)
const workouts = await stephub.getWorkoutHistory('telegram_12345', {
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

## Attestation (On-Chain Proof)

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
| `checkUser(userId)` | Check if user exists and has granted access |
| `getUserData(userId, scopes)` | Get user data filtered by scopes |
| `getDailyStats(userId, options?)` | Get daily activity stats (steps, distance, kcal, flights) |
| `getWorkoutHistory(userId, options?)` | Get paginated workout history |
| `nudge(userId)` | Send sync nudge to user's device |
| `prepareAttestation(userId)` | Prepare on-chain attestation data |
| `confirmAttestation(userId, attestationUid, txHash)` | Confirm attestation after on-chain tx |
| `requestConnection(externalUserId, permissions)` | Request a connection code (QR + deeplink) |
| `getConnectionStatus(requestId)` | Poll connection status |
| `waitForConnection(requestId, intervalMs?, timeoutMs?)` | Poll until authorized or expired |

### Scopes

| Scope | Description |
|-------|-------------|
| `READ_STEPS` | Access step count data |
| `READ_DISTANCE` | Access distance data |
| `READ_TRUST_TIER` | Access trust score and tier |
| `READ_WORKOUTS` | Access workout summary |
| `READ_WORKOUT_HISTORY` | Access detailed workout history |

## Error Handling

`StepHubError` is exported and can be used with `instanceof`:

```typescript
import { StepHubClient, StepHubError } from '@stephubprotocol/partner-sdk';

try {
  const result = await stephub.getUserData('telegram_12345', ['READ_STEPS']);
  console.log(result.data.steps); // access via result.data, not result directly
} catch (error) {
  if (error instanceof StepHubError) {
    console.error(error.statusCode);    // 401, 403, 404, etc.
    console.error(error.responseBody);  // Raw response body
  }
}
```

| Status | Meaning |
|--------|---------|
| 401 | Invalid clientId / clientSecret |
| 403 | User hasn't granted the requested scope |
| 404 | User not found or not connected |
| 429 | Rate limited (check `retryAfter`) |

## Requirements

- Node.js >= 18 (uses native `fetch`)
- Register your app at [StepHub Web Hub](https://stephubprotocol.xyz) to get API keys
