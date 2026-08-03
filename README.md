# @stephub/partner-sdk

TypeScript SDK for the **StepHub Partners API**.

## What this gives you

StepHub turns a phone's step data into something you can build on: activity that
came from a real device, with a signal telling you how much to trust it.

Your users connect their StepHub app to yours once. After that you can read:

- **Steps, distance, calories and floors** — per day or as totals, scoped to
  the period since they connected to *your* app.
- **A trust tier and score** (`DIAMOND` → `WOOD`) derived from where the data
  came from: hardware-attested device, first-party health source, third-party
  app, or manual entry. This is the part that is hard to build yourself, and it
  is what makes "reward people for walking" not immediately farmable.
- **Whether the data is still flowing**, so a silent tracker does not look like
  a lazy user.
- **On-chain proofs** — an EAS attestation on Base or an NFT badge on TON, if
  you want the user's activity anchored publicly.

What StepHub does *not* give you: raw GPS, heart-rate streams, or anything the
user did not grant. Every field is gated by a scope they approved.

## Getting credentials

You need a `clientId` and `clientSecret`. They are issued per application:

1. Open **[stephubprotocol.xyz/developers](https://stephubprotocol.xyz/developers)**
   and connect a wallet — that wallet becomes the owner of your app.
2. Register the application. You will get `clientId`, `clientSecret` and a
   `webhookSecret`.
3. **Store all three immediately.** The secrets are shown once and cannot be
   read back later; regenerating them invalidates the previous pair.

The `webhookSecret` is separate from the `clientSecret` and is used only to
verify the signature on events we send you — see [Webhooks](#webhooks).

## Install

```bash
npm install @stephub/partner-sdk
```

Live API reference — every endpoint, request and response, generated from the
running service: **[api.stephubprotocol.xyz/api/partners/docs](https://api.stephubprotocol.xyz/api/partners/docs)**

## Quick Start

```typescript
import { StepHubClient } from '@stephub/partner-sdk';

const stephub = new StepHubClient({
  apiUrl: 'https://api.stephubprotocol.xyz',
  clientId: 'your_app_id',
  clientSecret: 'your_secret',
});

// Namespaced API is the easiest entrypoint
const access = await stephub.users.getAccess('user-42');
console.log(access.hasAccess);
console.log(access.trustTier);

const profile = await stephub.users.getProfile('user-42', [
  'READ_STEPS',
  'READ_TRUST_TIER',
]);
console.log(profile.steps);
console.log(profile.trustTier);

const summary = await stephub.users.getSummary('user-42', [
  'READ_STEPS',
  'READ_TRUST_TIER',
]);
console.log(summary.access.percentile);
console.log(summary.profile.steps);

const stats = await stephub.users.getStats('user-42');
console.log(stats.steps);
console.log(stats.distance);
console.log(stats.trustTier);
```

### Always check whether data is flowing

A connection stays `ACTIVE` because the user never revoked permission — that
says nothing about whether their device still reports. A tracker can be silent
for months while `hasAccess` is `true` and every metric reads `0`. Rendering
those zeros as real numbers is the single most common integration bug, and it
makes **your** app look broken.

Handle it in the same place you read the numbers:

```typescript
const access = await stephub.users.getAccess('user-42');

if (access.hasAccess && access.dataFlowing === false) {
  // The zeros below are the tracker's silence, not the user's day.
  // Say so — and ask the device to sync.
  await stephub.users.nudge('user-42');
  return showTrackerSilent(access.lastSyncAt);
}

console.log(access.totalSteps);
```

- **`dataFlowing: false`** — the device has been silent well past a normal gap.
  This is the flag to branch on.
- **`stale: true`** — no sync within the last few hours. True for most users
  overnight, so it is *not* a reason to hide data on its own.
- **`nudge()`** — asks the user's device to sync now. Its natural pairing is
  exactly this branch; see [Nudge](#nudge-sync-fresh-data) for limits.

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

## What your users do

Your side is only half of it — the activity data comes from the StepHub mobile
app on the user's phone. Worth knowing before you design your onboarding, since
it is the part you have to explain to them.

**Once, before anything works:**

1. **Install StepHub** —
   [iOS](https://apps.apple.com/app/id6759161399) ·
   [Android](https://play.google.com/store/apps/details?id=xyz.stephubprotocol.android)
2. **Grant health access** — Apple Health on iOS, Health Connect on Android.
   This is where the provenance comes from, and without it there is nothing to
   verify. On Android below 14 Health Connect is a separate app the setup flow
   will offer to install.

**Every time they connect to an app like yours:**

3. You call `connections.start()` and show them what it returns — a QR code, a
   deep link, or a 6-character code (see below for which to use where).
4. They approve in the StepHub app, seeing exactly which scopes you asked for.
5. `startAndWait()` resolves, or your webhook fires, and their data is readable.

**After that it is automatic.** The app syncs in the background; users do not
open it daily. If a device has gone quiet, `dataFlowing` tells you, and
`nudge()` asks it to sync now.

### Which handoff to use

`connections.start()` returns three forms of the same request, valid for **5
minutes**:

| Field | Use when |
|-------|----------|
| `qrCode` | Your app is on desktop or web — they scan with their phone |
| `deeplink` | Your app is on the same phone — opens StepHub directly |
| `connectionCode` | Fallback — they type six characters into StepHub |

Showing the QR *and* the code side by side is the safest default: it works
whether they are at a laptop or holding the phone your app runs on.

## Connection Flow

When a user hasn't connected their StepHub mobile app yet:

```typescript
// Start a connection and wait for the result in one call
const status = await stephub.connections.startAndWait(
  'user-42',
  ['READ_STEPS', 'READ_TRUST_TIER'],
  { intervalMs: 2000, timeoutMs: 300000 },
);

// Wallet-aware partner flows can attach an optional wallet address to the request.
const walletAwareConnection = await stephub.connections.start(
  'user-77',
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
const stats = await stephub.users.getDailyStats('user-42', {
  startDate: '2026-02-11',
  endDate: '2026-02-18',
});

for (const day of stats.days) {
  console.log(`${day.date}: ${day.steps} steps, ${day.distance}m, ${day.activeKcal} kcal`);
}

// Get workout history (paginated)
const workouts = await stephub.users.getWorkoutHistory('user-42', {
  limit: 10,
  offset: 0,
});

for (const w of workouts.workouts) {
  console.log(`${w.type}: ${w.duration}s, ${w.distance}m (${w.tier})`);
}
console.log(`Total: ${workouts.pagination.total}, hasMore: ${workouts.pagination.hasMore}`);
```

## Nudge (Sync Fresh Data)

Asks the user's device to sync now, via silent push. Its natural pairing is
`dataFlowing === false`: numbers look stale, so ask the phone for fresh ones
before telling the user anything is wrong.

```typescript
const user = await stephub.users.getAccess('user-42');

if (user.dataFlowing === false) {
  const nudge = await stephub.users.nudge('user-42');
  if (nudge.nudged) {
    console.log(`Nudge sent to ${nudge.devicesSent} device(s)`);
  } else {
    console.log(`Cannot nudge: ${nudge.reason}, retry after ${nudge.retryAfter}s`);
  }
}
```

**Limits, and what to expect:**

- **Once per hour per user.** A second call inside that window returns
  `nudged: false` with `retryAfter` in seconds. It is not an error — treat it
  as "already asked recently".
- **It is a request, not a guarantee.** The push wakes the app if the phone is
  online and the OS allows it. A device that is off, out of signal, or has
  background refresh disabled will sync when it next can.
- **Do not poll after nudging.** Data arrives when the device syncs, typically
  within a minute or two if it is online. Read on your next natural request, or
  wait for the user's next action — a retry loop only burns the hourly budget.
- `devicesSent: 0` means no device could be reached at all, most often because
  none has a push token registered yet.

## Earning from mints

When one of your users mints a proof, **you get a share of the mint fee** —
20% by default — paid on-chain, automatically.

It works without any code on your side. Register your app with a wallet
address as owner, and when you call `attestations.prepare()` or
`tonBadges.prepare()` the backend registers the referral on-chain first. The
contract then pays your share the moment the user mints, before the badge
itself is issued — so a failed mint never costs you the payment.

The response carries `referralTxHash`: the registration transaction, or `null`
if your app has no owner address for that chain.

**Set a payout address for each chain you care about** — they are separate,
and configured when you register your app at
[/developers](https://stephubprotocol.xyz/developers):

| Chain | Field | If left empty |
|-------|-------|---------------|
| Base | `evmPayoutAddress` | Paid to the wallet you signed in with |
| TON | `ownerTonAddress` | **You earn nothing from TON mints** |

The Base field is optional because it falls back to your sign-in wallet; set it
only if payouts should go elsewhere, such as a treasury. TON has no such
fallback — without an address there, those mints pay you nothing, and nothing
else about your integration changes to signal it.

Your sign-in wallet stays your identity as the app owner either way; only the
payout target moves.

## On-Chain Proofs

### Base/EVM Attestation

Create verifiable on-chain proofs of physical activity using EAS (Ethereum Attestation Service):

```typescript
// 1. Prepare attestation data
const attestation = await stephub.prepareAttestation('user-42');

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
  'user-42',
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
  'user-42',
  'UQAol-7LDQ-Pt0G0xsut1vvgBikCiTrx9QCyyPif4QTRJgRf',
);

console.log(badge.collectionAddress);   // TON collection destination
console.log(badge.amount);              // nano-TON amount to attach
console.log(badge.payload);             // base64 BoC for messages[].payload
console.log(badge.expectedItemAddress); // deterministic soulbound badge address

// Forward into TonConnect from your app:
// messages: [{ address: badge.collectionAddress, amount: badge.amount, payload: badge.payload }]
```

## Field Names Across Endpoints

Distance is always **metres** and energy is always **kcal**, but the field names
differ by endpoint. Reading for a name that does not exist yields `undefined`,
which silently becomes `0` in most UIs — so check this table rather than
guessing:

| Meaning | `getAccess` | `getDailyStats` day | `getWorkoutHistory` item |
|---|---|---|---|
| Steps | `totalSteps`, `avgDailySteps`, `weeklySteps` | `steps` | — |
| Distance (m) | `totalDistance` | `distance` | `distance` |
| Energy (kcal) | — | `activeKcal` | `energy` |
| Floors climbed | — | `flights` | — |
| Data present | `dataFlowing` | `hasData` | — |

There is no `distanceM` or `elevationGain` anywhere in the API.

`activeKcal` on a daily row is energy for **the whole day**. Summing workout
energy instead returns 0 kcal for someone who walked all day without logging a
session — the number you want is already in the row you fetched.

## External IDs

`externalUserId` is **your** identifier for **your** user. StepHub stores it
against your app and hands it back to you; it is not a StepHub account id, and
StepHub keeps its own internal id regardless of what you send.

### Use whatever you already have

Examples here use plain ids like `user-42` deliberately: there is no required
shape. Send whatever is already stable on your side — a row id, a UUID, your
own prefixed string:

```typescript
// All equally fine — pick whatever is already stable on your side
await stephub.connections.start(`user-${user.id}`, scopes);
await stephub.connections.start(user.id, scopes);            // your own UUID
await stephub.connections.start(`acct-${user.accountNo}`, scopes);
```

### Collisions between partners are impossible

Identity is the pair **(your app, your id)**. If two different partners both
send `1`, those are two unrelated connections belonging to two unrelated
people — StepHub never treats them as the same user, and neither partner can
see or reach the other's. Your ids only need to be unique **within your own
app**, never globally.

### The one value StepHub interprets

A **wallet address** — EVM (`0x…`) or TON (`0:…`, `EQ…`, `UQ…`) — is the only
kind of id StepHub resolves on its own, because an address identifies exactly
one account no matter who sends it. Use one if that is genuinely how you
identify the user; otherwise anything else is treated as an opaque key.

Nothing else is interpreted. `telegram_…` and friends are just strings scoped
to your app, so a numeric internal id is safe to send in any shape you like.

### It must never change

Whatever you choose, that value identifies the user forever. Do not derive it
from anything mutable, and do not recompute it on each call — if the formula
ever changes, the account stays connected while every read returns "user not
found", with nothing failing loudly.

```typescript
// Bad: derived from data that may change, or re-prefixed each time
await stephub.connections.start(`telegram_${buildExtId(user)}`, scopes);
```

## Unknown vs. Disconnected Users

`getAccess` answers `200` for a user who does not exist:

```json
{ "exists": false, "hasAccess": false }
```

A user who never existed and one who disconnected are **not distinguishable**
from this response. If you need that difference — for churn metrics, say —
record it on your side at connect time.

## API Reference

### `new StepHubClient(config)`

| Option | Type | Description |
|--------|------|-------------|
| `apiUrl` | `string` | StepHub API base URL (`https://api.stephubprotocol.xyz`) |
| `clientId` | `string` | Your app's client ID |
| `clientSecret` | `string` | Your app's client secret |
| `timeout` | `number` | Request timeout in ms (default: 30000) |
| `firstRequestTimeout` | `number` | Timeout for the first request of this client (default: 45000) |

The first request of a process pays for DNS, TCP and the TLS handshake with
nothing cached, so it gets a larger budget than the ones after it. To pay that
cost before real traffic arrives, warm the client at startup:

```typescript
// Fire and forget at boot — the first user request then rides a warm connection
stephub.users.getAccess('warmup').catch(() => {});
```


### Two ways to call, one canonical

Every method exists both flat (`client.getAccess()`) and namespaced
(`client.users.getAccess()`). They are the same call. The **namespaced form is
canonical**; the flat ones are marked `@deprecated` and will be removed in 1.0.

Nothing breaks today — this only removes the ambiguity of seeing each method
twice in autocomplete without knowing which to pick.

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
| `users.nudge(userId)` | Ask the device to sync now — once per hour per user |
| `connections.start(externalUserId, permissions, options?)` | Request a connection code (QR + deeplink); optional `walletAddress` for wallet-aware flows |
| `connections.status(requestId)` | Poll connection status |
| `connections.wait(requestId, options?)` | Poll until authorized or expired |
| `connections.startAndWait(externalUserId, permissions, options?)` | Start a connection flow and wait for the final status; accepts wait options and optional `walletAddress` |
| `attestations.prepare(userId)` | Prepare Base/EVM EAS attestation data |
| `attestations.confirm(userId, attestationUid, txHash)` | Confirm Base/EVM attestation after on-chain tx |
| `tonBadges.prepare(userId, tonAddress)` | Prepare TON soulbound badge mint payload for TonConnect |

Flat equivalents (`client.getAccess()`, `client.nudge()`, …) still work but are
deprecated — see above. Lower-level raw methods (`checkUser`, `getUserData`,
`prepareTonBadge`) remain available if you need the unshaped response.

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
| `connection.revoked` | Access ended — the user revoked it, or the connection moved to a new device |
| `activity.synced` | Their device delivered new data |
| `connection.data_stalled` | The device has gone quiet past the usual gap |
| `trust.tier_changed` | Their trust tier moved up or down |
| `badge.minted` | They minted a badge — your referral share is settled on-chain |

Every payload carries `event`, `userId`, `externalUserId` and `timestamp`, plus
the fields below.

**`activity.synced`** — one event per completed sync, not per changed value:

```json
{
  "event": "activity.synced",
  "externalUserId": "user-42",
  "daysUpdated": ["2026-08-02", "2026-08-03"],
  "workoutsAdded": 2
}
```

`daysUpdated` tells you what to re-fetch, so you can skip the call entirely when
nothing you care about moved. This is the event that replaces polling.

**`connection.data_stalled`** — carries `lastSyncAt` (or `null` if they never
synced). Fires once per silence, not repeatedly, and only after data resumes can
it fire again. This is the counterpart to `dataFlowing`: the same state, but it
arrives instead of waiting to be asked for.

**`trust.tier_changed`** — carries `previousTier`, `currentTier` and
`trustScore`. Only tier changes are reported; the score itself drifts constantly
and carries no decision on its own. A drop is worth handling: it is the case
where reacting late costs you.

**`badge.minted`** — carries `chain` (`base` or `ton`) and `txHash`. Note that
`referralTxHash` at prepare time only means the referral was registered; this
event means the mint actually happened and your share was paid.

### Verifying the signature

Every delivery carries `X-StepHub-Signature`: an **HMAC-SHA256** of the raw
request body, keyed with your **`webhookSecret`** — not your `clientSecret`.
They are separate values, issued together when you register the app.

Verify over the *raw* body, before any JSON parsing, and compare in constant
time:

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

function isFromStepHub(rawBody: Buffer, header: string, webhookSecret: string) {
  const expected = 'sha256=' + createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Re-serialising the parsed body will not reproduce the signature — key order and
whitespace differ. Capture the raw bytes in your HTTP layer (in Express:
`express.raw({ type: 'application/json' })` on this route).

### Delivery and retries

Failed deliveries are retried five times with exponential backoff, over roughly
ten minutes. A non-2xx response counts as a failure, so returning `200` quickly
and doing the work afterwards is the safer pattern.

Handle the same event arriving twice — a retry after a timeout on your side
means you may already have processed it.

The SDK does not ship a verification helper; the snippet above is all it takes.

Payload types are exported, discriminated on `event`:

```typescript
import type { StepHubWebhookPayload } from '@stephub/partner-sdk';

function handle(payload: StepHubWebhookPayload) {
  switch (payload.event) {
    case 'activity.synced':
      return refetch(payload.externalUserId, payload.daysUpdated);
    case 'connection.data_stalled':
      return showTrackerSilent(payload.lastSyncAt);
    case 'trust.tier_changed':
      return payload.currentTier === 'WOOD' ? pauseRewards() : resume();
  }
}
```

## Error Handling

`StepHubError` is exported and can be used with `instanceof`:

```typescript
import { StepHubClient, StepHubError } from '@stephub/partner-sdk';

try {
  const profile = await stephub.users.getProfile('user-42', ['READ_STEPS']);
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

Use `error.isTimeout()` to tell the two apart — a timeout is worth retrying,
a refused connection or bad URL is not:

```typescript
try {
  await stephub.users.getAccess(userId);
} catch (error) {
  if (error instanceof StepHubError && error.isTimeout()) {
    // Slow cold path or a stalled connection — retrying is reasonable
  }
}
```

## Requirements

- Node.js >= 18 (uses native `fetch`)
- Register your app at [StepHub Web Hub](https://stephubprotocol.xyz) to get API keys

## Questions, problems, ideas

Something unclear, missing, or behaving oddly? Write to
**[@gallaam](https://t.me/gallaam)** on Telegram — integration questions,
feature requests and bug reports all welcome, and a real person answers.

If you hit something that cost you debugging time, that is exactly the feedback
worth sending: several parts of this README exist because a partner reported
what tripped them up.
