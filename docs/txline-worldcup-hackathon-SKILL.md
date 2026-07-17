---
name: txline-worldcup-hackathon
description: >
  Full context for building on the TxLINE API during the Superteam MY x TxOdds
  World Cup Hackathon. Load this whenever you (the builder or your AI assistant)
  need to know how to authenticate, subscribe to the free World Cup tier, fetch
  fixtures/odds/scores, stream live data, validate scores on-chain against Solana
  Merkle roots, or decide what to build across the three hackathon tracks. Contains
  every network address, endpoint, header, service level, stat encoding, and code
  pattern needed to ship end to end. Trigger for any TxLINE integration question,
  any "how do I get the data" question, and any World Cup hackathon scoping or
  submission question.
---

# TxLINE World Cup Hackathon — Complete Builder Skill

Everything an AI assistant needs to help a team ship on TxLINE during the
Superteam MY x TxOdds World Cup Hackathon. Compiled from the Luma brief and the
full TxLINE documentation (quickstart, World Cup free tier, snapshots, streaming,
on-chain validation, program addresses, soccer feed, odds/scores overviews, and
subscription tiers).

**Golden rule for the assistant using this file: be critical, not validating.
Pressure-test the build. Point out red flags. Do not cheerlead a bad idea.**

---

## 0. The Hackathon At A Glance

| Item | Detail |
|---|---|
| Event | Superteam MY x TxOdds World Cup Hackathon |
| Host | Superteam Malaysia (KL leg of a global build sprint) |
| Data sponsor | TxOdds — 27-year-old UK sports data firm; feeds power sportsbooks like FanDuel and Betfair |
| Venue (local) | AWS office, Level 35, The Gardens North Tower, Mid Valley City, KL |
| Global prize pool | $50,000 (submitted on Superteam Earn) |
| Local MY pool | ~$5,000 additional for Malaysian builders |
| Submit once | One submission enters both pools |
| Deadline | **19 July** |
| Build window | The tournament itself — data is live, matches are live |

### The framing
Two billion people watch the World Cup; almost none build on it. For the length
of the tournament, TxOdds opens its live World Cup data **for free** through the
TxLINE API and anchors every result on Solana — so the scores, odds, and outcomes
your product runs on are verifiable on-chain.

### The three tracks
1. **Prediction markets & settlement** — e.g. markets that settle trustlessly from on-chain-verified scores.
2. **Trading tools & agents** — e.g. a live odds terminal, or an agent that trades the matches.
3. **Consumer & fan experiences** — e.g. a fan app that turns the knockout rounds into something a group chat can't put down.

### What "good" looks like for judges (from the Superteam/Colosseum playbook)
- **Solana-native angle must be genuine.** The unfair advantage here is that TxLINE anchors data on-chain and lets you *validate scores against Solana Merkle roots*. A build that just calls the REST API and ignores on-chain verification is leaving the whole point on the table. Use `validateStat` for settlement/conditional logic — that's the differentiated move.
- **Specific user, specific problem.** Not "for everyone." Who refreshes this during a match?
- **Working demo > deck.** Real data, live matches — show it running.
- **Distribution thinking.** Who are the first 10 users and how do they hear about it?

---

## 1. Mental Model: How TxLINE Works

TxLINE is a **hybrid on-chain + off-chain system**:
- **Off-chain (TxODDS):** the actual fixtures, odds (StablePrice consensus engine), and scores, served over a normal HTTPS REST/SSE API.
- **On-chain (Solana):** cryptographic anchors (Merkle roots) for fixtures, odds, and scores, plus the subscription/access-control program. You prove any data point against these roots with no intermediary.

Access flow (once): **pick network → set up wallet → subscribe on-chain (free for World Cup) → activate an API token → call the data API with two headers.**

Two credentials travel with every data request:

| Header | Value |
|---|---|
| `Authorization` | `Bearer ${jwt}` — guest JWT from `/auth/guest/start` |
| `X-Api-Token` | `apiToken` — returned by `/api/token/activate` |

---

## 2. Networks & Addresses — pick ONE and stay on it

> **Critical:** The Solana RPC, program ID, TxL mint, guest JWT, and activation
> endpoint must ALL be on the same network. A devnet subscribe transaction must be
> activated on the devnet host; a mainnet subscribe must be activated on the
> mainnet host. Mixing them fails.

### Mainnet
| Type | Value |
|---|---|
| Program ID | `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA` |
| TxL Token Mint | `Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL` |
| USDT Mint | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` |
| RPC | `https://api.mainnet-beta.solana.com` |
| API origin | `https://txline.txodds.com` |
| Guest auth | `https://txline.txodds.com/auth/guest/start` |
| API base | `https://txline.txodds.com/api/` |

### Devnet
| Type | Value |
|---|---|
| Program ID | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| TxL Token Mint | `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG` |
| USDT Mint | `ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh` |
| RPC | `https://api.devnet.solana.com` |
| API origin | `https://txline-dev.txodds.com` |
| Guest auth | `https://txline-dev.txodds.com/auth/guest/start` |
| API base | `https://txline-dev.txodds.com/api/` |

**Which to use for the hackathon?** Mainnet is where both free World Cup tiers
live (service level 1 = 60s delay, service level 12 = real-time). Devnet currently
only documents service level 1 (60s delay). If you want real-time World Cup data,
you must be on **mainnet, service level 12**.

---

## 3. Free World Cup Access — the tier you'll actually use

Two **completely free** tiers, no payment, no card, no TxL purchase:

| Service Level | Bundle | Delay | Network |
|---|---|---|---|
| **1** | World Cup & Int Friendlies | 60 seconds | Mainnet + Devnet |
| **12** | World Cup & Int Friendlies | Real-time | Mainnet |

- No rate limits on API calls (the only difference on free tier is the 60s delay on level 1).
- Historical replay of past matches included.
- Commercial use allowed.
- Subscriptions are bought in multiples of 4 weeks (28 days); free tiers cost nothing to renew — just re-subscribe.
- The free subscribe transaction still registers your wallet on-chain and must be activated against the matching API host.

Paid tiers (context only — you don't need these for the hackathon) start at
500,000 TxL ($500) / 28 days for 10 leagues, up to 25,000,000 TxL ($25,000) for
all leagues real-time. Conversion: 1 USD = 1,000 TxL. All subs include Scores + StablePrice Odds.

---

## 4. Setup & Onboarding Code (TypeScript)

### Install
```bash
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token axios tweetnacl
```

### Select network + init the Anchor program
```typescript
import * as anchor from "@coral-xyz/anchor";
import type { Txoracle } from "./types/txoracle"; // matching mainnet/devnet type
import txoracleIdl from "./idl/txoracle.json";     // matching mainnet/devnet IDL
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import axios from "axios";
import nacl from "tweetnacl";

const NETWORK: "mainnet" | "devnet" = "mainnet";

const CONFIG = {
  mainnet: {
    rpcUrl: "https://api.mainnet-beta.solana.com",
    apiOrigin: "https://txline.txodds.com",
    programId: new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA"),
    txlTokenMint: new PublicKey("Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL"),
  },
  devnet: {
    rpcUrl: "https://api.devnet.solana.com",
    apiOrigin: "https://txline-dev.txodds.com",
    programId: new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
    txlTokenMint: new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG"),
  },
} as const;

const { rpcUrl, apiOrigin, programId, txlTokenMint } = CONFIG[NETWORK];
const apiBaseUrl = `${apiOrigin}/api`;

const connection = new Connection(rpcUrl, "confirmed");
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const program = new anchor.Program<Txoracle>(txoracleIdl as Txoracle, provider);

if (!program.programId.equals(programId)) {
  throw new Error(`IDL program ${program.programId.toBase58()} != ${NETWORK} ${programId.toBase58()}`);
}
```

### Derive the shared PDAs
```typescript
const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("token_treasury_v2")], program.programId
);

const tokenTreasuryVault = getAssociatedTokenAddressSync(
  txlTokenMint, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
);

const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("pricing_matrix")], program.programId
);

const userTokenAccount = getAssociatedTokenAddressSync(
  txlTokenMint, provider.wallet.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
);
```

### Subscribe to the free World Cup tier (on-chain)
```typescript
const SERVICE_LEVEL_ID = 1;   // 1 = 60s delay (mainnet+devnet); 12 = real-time (mainnet)
const DURATION_WEEKS = 4;     // multiples of 4 weeks
const SELECTED_LEAGUES: number[] = []; // empty = standard bundle

const txSig = await program.methods
  .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
  .accounts({
    user: provider.wallet.publicKey,
    pricingMatrix: pricingMatrixPda,
    tokenMint: txlTokenMint,
    userTokenAccount,
    tokenTreasuryVault,
    tokenTreasuryPda,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

console.log("Subscription tx:", txSig);
```

### Activate your API token
```typescript
// 1. Guest JWT
const authResponse = await axios.post(`${apiOrigin}/auth/guest/start`);
const jwt = authResponse.data.token;

// 2. Sign activation message: `${txSig}:${leagues}:${jwt}` (empty leagues => `${txSig}::${jwt}`)
const messageString = `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`;
const message = new TextEncoder().encode(messageString);

async function signActivationMessage(message: Uint8Array): Promise<Uint8Array> {
  if ("signMessage" in wallet && wallet.signMessage) return wallet.signMessage(message);
  const localPayer = (provider.wallet as anchor.Wallet & { payer?: anchor.web3.Keypair }).payer;
  if (localPayer) return nacl.sign.detached(message, localPayer.secretKey);
  throw new Error("Wallet must support signMessage, or run with a local Anchor payer.");
}

const signatureBytes = await signActivationMessage(message);
const walletSignature = Buffer.from(signatureBytes).toString("base64");

// 3. Activate
const activationResponse = await axios.post(
  `${apiBaseUrl}/token/activate`,
  { txSig, walletSignature, leagues: SELECTED_LEAGUES },
  { headers: { Authorization: `Bearer ${jwt}` } }
);

const apiToken = activationResponse.data.token || activationResponse.data;
console.log("API Token activated!");
```

### The authenticated HTTP client you'll reuse everywhere
```typescript
const httpClient = axios.create({
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${jwt}`,
    "X-Api-Token": apiToken,
  },
  baseURL: apiOrigin, // e.g. https://txline.txodds.com
});
```

---

## 5. Fetching Data (Snapshots)

### Fixtures
```typescript
// For a specific competition
const fixturesResponse = await httpClient.get("/api/fixtures/snapshot", {
  params: { competitionId: 500005 },
});
const fixtures = fixturesResponse.data;

// All fixtures
const allFixtures = (await httpClient.get("/api/fixtures/snapshot")).data;
```
> **Home/away caveat:** `Participant1IsHome` is the feed's home/away designation
> for mapping `Participant1`/`Participant2`, **not a venue guarantee**. For neutral
> competitions like the World Cup, `Participant1IsHome: true` just means Participant1
> is listed as home for feed purposes, even though the match is on neutral ground.
> Key fields: `FixtureId`, `Participant1`, `Participant2`, `Participant1IsHome`, `StartTime`.

### Odds
```typescript
const fixtureId = 17271370;

// Odds for a fixture
const fixtureOdds = (await httpClient.get(`/api/odds/snapshot/${fixtureId}`)).data;

// Odds updates for a time bucket: /api/odds/updates/{epochDay}/{hourOfDay}/{interval}
const updates = (await httpClient.get(`/api/odds/updates/20085/15/0`)).data;
```

### Scores
```typescript
const fixtureId = 17271370;

// Snapshot for a fixture
const snapshotScores = (await httpClient.get(`/api/scores/snapshot/${fixtureId}`)).data;

// Live updates for a fixture
const liveScores = (await httpClient.get(`/api/scores/updates/${fixtureId}`)).data;

// Time-bucketed updates: /api/scores/updates/{epochDay}/{hourOfDay}/{interval}
const historicalUpdates = (await httpClient.get(`/api/scores/updates/20085/15/0`)).data;
```

### Time-bucket math (epochDay / hour / interval)
```typescript
const targetTime = new Date(Date.now() - 25 * 60 * 1000); // 25 min ago
const epochDay = Math.floor(targetTime.getTime() / 86400000);
const hourOfDay = targetTime.getUTCHours();
const interval = Math.floor(targetTime.getUTCMinutes() / 5); // 5-min buckets
```

### Historical scores for one fixture
```typescript
const fixtureId = 17952170;
const historicalScores = await httpClient.get(`/api/scores/historical/${fixtureId}`);
// each update: { seq, ts, gameState, ... }
```
> Only returns fixtures whose start time is **between two weeks and six hours ago**.

---

## 6. Streaming Live Data (Server-Sent Events)

Two live streams: `GET /api/odds/stream` and `GET /api/scores/stream`.

### Headers for a stream
```typescript
const streamResponse = await fetch("https://txline.txodds.com/api/scores/stream", {
  headers: {
    Authorization: `Bearer ${jwt}`,
    "X-Api-Token": apiToken,
    Accept: "text/event-stream",
    "Cache-Control": "no-cache",
  },
});
if (!streamResponse.ok) throw new Error(`Stream failed: ${streamResponse.status}`);
```

### SSE parsing helpers (reuse for both streams)
```typescript
type SseMessage = { id?: string; event?: string; data: string; retry?: number };

function parseSseBlock(block: string): SseMessage | null {
  const message: SseMessage = { data: "" };
  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(":")) continue;
    const i = rawLine.indexOf(":");
    const field = i === -1 ? rawLine : rawLine.slice(0, i);
    const value = i === -1 ? "" : rawLine.slice(i + 1).replace(/^ /, "");
    if (field === "data") message.data += `${value}\n`;
    if (field === "event") message.event = value;
    if (field === "id") message.id = value;
    if (field === "retry") message.retry = Number(value);
  }
  message.data = message.data.replace(/\n$/, "");
  return message.data || message.event || message.id ? message : null;
}

async function* readSseMessages(response: Response): AsyncGenerator<SseMessage> {
  if (!response.body) throw new Error("Stream response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.match(/\r?\n\r?\n/);
      while (sep?.index !== undefined) {
        const block = buffer.slice(0, sep.index);
        buffer = buffer.slice(sep.index + sep[0].length);
        const m = parseSseBlock(block);
        if (m) yield m;
        sep = buffer.match(/\r?\n\r?\n/);
      }
    }
    buffer += decoder.decode();
    const m = parseSseBlock(buffer);
    if (m) yield m;
  } finally {
    reader.releaseLock();
  }
}

function parseSseData(data: string) {
  try { return JSON.parse(data); } catch { return data; }
}

// Consume:
for await (const message of readSseMessages(streamResponse)) {
  console.log(message.event ?? "message", parseSseData(message.data));
}
```
> **Bandwidth:** add `"Accept-Encoding": "gzip"` to cut 70–80% of bandwidth, then
> `gunzipSync()` (Node `zlib`) the chunks before decoding.

---

## 7. On-Chain Validation — the Solana-native differentiator

This is the part that makes a build genuinely Solana-native and settlement-grade:
prove a score/stat against on-chain Merkle roots with **no intermediary**. Use it
for trustless bet settlement, conditional smart-contract logic, dispute resolution,
automated prediction-market settlement, and score-differential markets.

### Setup helpers
```typescript
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

function toBytes32(value: string | number[] | Uint8Array): number[] {
  const bytes = Array.isArray(value) ? Uint8Array.from(value)
    : value instanceof Uint8Array ? value
    : value.startsWith("0x") ? Buffer.from(value.slice(2), "hex")
    : Buffer.from(value, "base64");
  if (bytes.length !== 32) throw new Error(`Expected 32 bytes, received ${bytes.length}`);
  return Array.from(bytes);
}

function toProofNodes(nodes: Array<{ hash: string | number[] | Uint8Array; isRightSibling: boolean }>) {
  return nodes.map((n) => ({ hash: toBytes32(n.hash), isRightSibling: n.isRightSibling }));
}
```

### Single-stat validation
```typescript
// 1. Fetch validation data (Merkle proofs) from the API
const response = await httpClient.get("/api/scores/stat-validation", {
  params: { fixtureId: 17952170, seq: 941, statKey: 1002 },
});
const validation = response.data;

// 2. Shape the fixture summary + proofs for the program
const fixtureSummary = {
  fixtureId: new BN(validation.summary.fixtureId),
  updateStats: {
    updateCount: validation.summary.updateStats.updateCount,
    minTimestamp: new BN(validation.summary.updateStats.minTimestamp),
    maxTimestamp: new BN(validation.summary.updateStats.maxTimestamp),
  },
  eventsSubTreeRoot: toBytes32(validation.summary.eventStatsSubTreeRoot),
};
const fixtureProof  = toProofNodes(validation.subTreeProof);
const mainTreeProof = toProofNodes(validation.mainTreeProof);
const stat1 = {
  statToProve: validation.statToProve,
  eventStatRoot: toBytes32(validation.eventStatRoot),
  statProof: toProofNodes(validation.statProof),
};

// 3. Predicate: e.g. "stat > 0"
const predicate = { threshold: 0, comparison: { greaterThan: {} } };

// 4. Derive the daily scores PDA from the stat's timestamp
const targetTs = validation.summary.updateStats.minTimestamp;
const epochDay = Math.floor(targetTs / (24 * 60 * 60 * 1000));
const [dailyScoresPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("daily_scores_roots"), new BN(epochDay).toArrayLike(Buffer, "le", 2)],
  program.programId
);

// 5. Simulate the validation read-only (.view()) with a raised compute budget
const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
const isValid = await program.methods
  .validateStat(new BN(targetTs), fixtureSummary, fixtureProof, mainTreeProof, predicate, stat1, null, null)
  .accounts({ dailyScoresMerkleRoots: dailyScoresPda })
  .preInstructions([computeBudgetIx])
  .view();
console.log("Stat validation passed:", isValid);
```

### Two-stat validation (e.g. score differential margins)
```typescript
const response2 = await httpClient.get("/api/scores/stat-validation", {
  params: { fixtureId: 17952170, seq: 941, statKey: 1002, statKey2: 1003 },
});
const validation2 = response2.data;

const stat2 = {
  statToProve: validation2.statToProve2,
  eventStatRoot: toBytes32(validation2.eventStatRoot),
  statProof: toProofNodes(validation2.statProof2),
};

const op = { subtract: {} };
const predicate2 = { threshold: 5, comparison: { lessThan: {} } }; // |diff| < 5

const isValid2 = await program.methods
  .validateStat(new BN(targetTs), fixtureSummary, fixtureProof, mainTreeProof, predicate2, stat1, stat2, op)
  .accounts({ dailyScoresMerkleRoots: dailyScoresPda })
  .preInstructions([computeBudgetIx])
  .view();
console.log("Two-stat validation:", isValid2);
```

---

## 8. Soccer Encoding Reference (for validation & settlement)

### Game phase encoding
| Name | ID | Meaning | Name | ID | Meaning |
|---|---|---|---|---|---|
| NS | 1 | Not started | FET | 10 | Ended after Extra Time |
| H1 | 2 | First half in play | WPE | 11 | Waiting for Penalty Shootout |
| HT | 3 | Halftime | PE | 12 | Penalty Shootout in progress |
| H2 | 4 | Second half in play | FPE | 13 | Ended after Penalty Shootout |
| F | 5 | Ended (finished) | I | 14 | Interrupted |
| WET | 6 | Waiting for Extra Time | A | 15 | Abandoned |
| ET1 | 7 | Extra Time first half | C | 16 | Cancelled |
| HTET | 8 | Extra Time halftime | TXCC | 17 | TX Coverage Cancelled |
| ET2 | 9 | Extra Time second half | TXCS | 18 | TX Coverage Suspended |
|  |  |  | P | 19 | Postponed |

> World Cup knockout builds must handle 6–13 (extra time + penalties) — that's
> exactly where the drama and the settlement edge cases live.

### Stat key encoding
Formula: **`(period * 1000) + base_key`**

Full-game base keys:
| Key | Stat | Key | Stat |
|---|---|---|---|
| 1 | P1 Total Goals | 5 | P1 Total Red Cards |
| 2 | P2 Total Goals | 6 | P2 Total Red Cards |
| 3 | P1 Total Yellow Cards | 7 | P1 Total Corners |
| 4 | P2 Total Yellow Cards | 8 | P2 Total Corners |

Period multipliers (add to base key):
- First Half (H1): **+1000** → e.g. 1001 = P1 H1 Goals
- Second Half (H2): **+2000** → 2001 = P1 H2 Goals
- Extra Time 1 (ET1): **+3000** → 3001 = P1 ET1 Goals
- Extra Time 2 (ET2): **+4000** → 4001 = P1 ET2 Goals
- Penalty Shootout (PE): **+5000** → 5001 = P1 PE Goals

(So `statKey: 1002` in the validation example = P2 H1 Goals.)

Full soccer feed PDF: https://txodds.github.io/tx-on-chain/assets/txodds-soccer-feed-v1.0.pdf

---

## 9. Odds Feed Notes (StablePrice)

- Odds are powered by **StablePrice**, TxODDS' consensus pricing engine, aggregating
  lines across global operators (including sharp books absent from standard Western feeds).
- Built-in defensive logic filters outliers, stale lines, and bad data before it reaches you (de-margining + outlier filtering).
- Every price is anchored on Solana for trustless verification and historical backtesting.
- Performance: 60-second batch updates (Build tier) vs sub-second real-time streams (Scale tier). On free World Cup: level 1 = 60s, level 12 = real-time.

---

## 10. All PDAs In One Place

```typescript
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";

// Access-control / subscription
const [tokenTreasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("token_treasury_v2")], programId);
const [pricingMatrixPda] = PublicKey.findProgramAddressSync([Buffer.from("pricing_matrix")], programId);
const [usdtTreasuryPda]  = PublicKey.findProgramAddressSync([Buffer.from("usdt_treasury")], programId);

// Validation roots (per epoch day)
const epochDay = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
const [dailyScoresPda]     = PublicKey.findProgramAddressSync(
  [Buffer.from("daily_scores_roots"), new BN(epochDay).toArrayLike(Buffer, "le", 2)], programId); // scores
const [dailyBatchRootsPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("daily_batch_roots"), new BN(epochDay).toArrayLike(Buffer, "le", 2)], programId);  // odds

// Fixtures roots are bucketed per 10 days
const alignedEpochDay = Math.floor(epochDay / 10) * 10;
const [tenDailyFixturesRootsPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("ten_daily_fixtures_roots"), new BN(alignedEpochDay).toArrayLike(Buffer, "le", 2)], programId);
```

Seeds summary:
| PDA | Seed(s) | Used for |
|---|---|---|
| Token Treasury | `"token_treasury_v2"` | Collects TxL subscription fees |
| Pricing Matrix | `"pricing_matrix"` | On-chain service-tier pricing |
| USDT Treasury | `"usdt_treasury"` | Collects USDT for TxL purchases |
| Daily Scores Roots | `"daily_scores_roots"` + epochDay(le,2) | Validate **scores** |
| Daily Batch Roots | `"daily_batch_roots"` + epochDay(le,2) | Validate **odds** |
| Ten Daily Fixtures Roots | `"ten_daily_fixtures_roots"` + alignedEpochDay(le,2) | Validate **fixtures** |

---

## 11. Endpoint Cheat Sheet

| Purpose | Method + Path |
|---|---|
| Guest JWT | `POST {origin}/auth/guest/start` |
| Activate token | `POST {api}/token/activate` |
| Purchase quote (paid only) | `POST {api}/guest/purchase/quote` |
| Fixtures snapshot | `GET {api}/fixtures/snapshot?competitionId=...` |
| Odds snapshot (fixture) | `GET {api}/odds/snapshot/{fixtureId}` |
| Odds updates (time bucket) | `GET {api}/odds/updates/{epochDay}/{hour}/{interval}` |
| Odds live stream | `GET {api}/odds/stream` (SSE) |
| Scores snapshot (fixture) | `GET {api}/scores/snapshot/{fixtureId}` |
| Scores updates (fixture) | `GET {api}/scores/updates/{fixtureId}` |
| Scores updates (time bucket) | `GET {api}/scores/updates/{epochDay}/{hour}/{interval}` |
| Scores historical (fixture) | `GET {api}/scores/historical/{fixtureId}` |
| Stat validation proof | `GET {api}/scores/stat-validation?fixtureId=&seq=&statKey=[&statKey2=]` |
| Scores live stream | `GET {api}/scores/stream` (SSE) |

All data endpoints require both `Authorization: Bearer ${jwt}` and `X-Api-Token: ${apiToken}`.

---

## 12. Build Recipes By Track

**Prediction markets & settlement**
- Market resolves from `validateStat` against `daily_scores_roots` — no oracle middleman, fully trustless settlement. That's your headline.
- Handle penalty-shootout phases (11–13) and use PE stat keys (+5000) for shootout outcomes.
- Two-stat validation → margin/handicap/over-under markets (e.g. total goals < N, winning margin).

**Trading tools & agents**
- Live odds terminal: subscribe to `/api/odds/stream`, render StablePrice consensus, show line movement.
- Agent that trades matches: consume both streams, act on score events, prove fills against on-chain roots.
- Backtest on historical replay before the live match.

**Consumer & fan experiences**
- Group-chat-native knockout app: `/api/scores/stream` for live goals, push to a Telegram/mini-app.
- Pick'em / bracket with on-chain-verifiable settlement so nobody can dispute results.
- Fan token / reaction moments keyed off game phase transitions (goal, red card, penalties).

---

## 13. Common Pitfalls (tell the builder before they hit these)

1. **Network mixing** — devnet subscribe + mainnet activation = fails. One network, everywhere.
2. **Real-time on the wrong level** — free real-time World Cup data is **mainnet service level 12**; level 1 is 60s delayed.
3. **Assuming `Participant1IsHome` means venue** — it's a feed mapping, not a location. World Cup is neutral ground.
4. **Historical endpoint window** — `/scores/historical/{id}` only covers fixtures started between 2 weeks and 6 hours ago.
5. **Forgetting the compute budget** — on-chain `validateStat` needs a raised compute unit limit (`1_400_000`) via `preInstructions`.
6. **Wrong stat key math** — remember `(period * 1000) + base_key`; a full-game goal is key 1/2, not 1001/2001.
7. **Skipping on-chain validation entirely** — if you only hit REST, you've built a generic sports app on any-chain infra and thrown away the Solana-native score. Judges will notice.

---

## 14. Support & Links

- Quickstart: https://txline.txodds.com/documentation/quickstart
- World Cup free tier: https://txline.txodds.com/documentation/worldcup
- Subscription tiers: https://txline.txodds.com/documentation/subscription-tiers
- Fetching snapshots: https://txline.txodds.com/documentation/examples/fetching-snapshots
- Streaming data: https://txline.txodds.com/documentation/examples/streaming-data
- On-chain validation: https://txline.txodds.com/documentation/examples/onchain-validation
- Program addresses: https://txline.txodds.com/documentation/programs/addresses
- Soccer feed: https://txline.txodds.com/documentation/scores/soccer-feed
- Docs index (for your AI to crawl the rest): https://txline-docs.txodds.com/llms.txt
- OpenAPI spec: https://txline.txodds.com/docs/docs.yaml
- Developer support: TxOdds Discord + Telegram
- Hackathon page: https://luma.com/7yvedc2g — submit on Superteam Earn by **19 July**

---

## The One-Liner

> The World Cup data is free, live, and anchored on Solana. Anyone can read a
> score — your edge is *proving* it on-chain with `validateStat`. Build the thing
> that needs verifiable outcomes, point it at a specific user, and ship it before
> the final whistle on 19 July.
