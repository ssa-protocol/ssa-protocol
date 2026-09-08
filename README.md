# SSA — Self-Sovereign Agent Protocol

**An open protocol for AI agents with persistent identity, wallets and portable state.**

> **Status:** v0.1 Draft / reference implementation. Not audited.

SSA is designed to sit underneath existing agent frameworks. It does not replace an LLM, agent loop, memory framework or hosting provider.

It gives an agent a small set of portable primitives:

- **Persistent identity** — cryptographic identity independent of a single host or framework.
- **EVM wallet** — an independently addressable wallet the runtime can use through deterministic policy controls.
- **Portable state** — memory/configuration/checkpoints can travel inside an encrypted `.ssa` capsule.
- **Proof of continuity** — an SSA can cryptographically prove it is the same identity after moving runtimes.
- **Optional public network** — agents can register publicly and send signed liveness heartbeats.
- **Robinhood Stock Token mandate** — an agent can resolve a canonical Robinhood Stock Token, attach it to its public manifest, read the live Robinhood quote and inspect its own onchain token balance.

## Live network

SSA's first public network is live on **Robinhood Chain mainnet (EIP-155 chain ID `4663`)**.

**SSARegistry:** `0x00EA5FF037c779841267fAb2c5B8eee435EE423f`

The public registry records only public agent metadata. It does **not** custody agent private keys, memory or capsule contents.

Live network UI: https://agent-id-chain.lovable.app

## Repository layout

```text
protocol/                 Core TypeScript reference implementation
  src/                    Identity, capsule, state, signing, EVM wallet
  spec/                   SSA 0.1 draft specification + JSON schema
  examples/               Minimal integration examples
  tests/                  Core and policy tests

network/                  Optional public-network layer
  contracts/              SSARegistry.sol
  network-sdk/            registerSSA() + heartbeat() helpers
  supabase/               Signed-heartbeat backend reference
  lovable/                Reference live-network UI component
```

## How an agent joins the public network

An SSA can exist privately without registering anywhere. Public registration is opt-in.

```text
existing AI agent
      ↓
SSA identity + wallet + portable state
      ↓
register() once on Robinhood Chain
      ↓
REGISTERED SSAs +1
      ↓
signed heartbeats while the agent is running
      ↓
ACTIVE SSAs +1
```

If heartbeats stop for more than 24 hours, the agent remains registered but is no longer counted as active.

## Run the reference protocol from source

```bash
git clone https://github.com/ssa-protocol/ssa-protocol.git
cd ssa-protocol/protocol
npm install
npm run build
npm test
```

The npm name `@ssa/protocol` is used by the package source, but **v0.1 has not been published to npm yet**. Until it is published, use this repository directly.

## Minimal example

```ts
import { createSSA } from "./dist/index.js";
import { attachRobinhoodWallet } from "./dist/evm.js";

const agent = createSSA({
  name: "research-agent",
  state: { memory: [] },
});

const wallet = attachRobinhoodWallet(agent);
agent.setState("memory", ["portable state"]);

await agent.save("research-agent.ssa", process.env.SSA_PASSPHRASE!);

console.log(agent.id);
console.log(wallet.address);
```

The reference SDK defaults new EVM wallets to Robinhood Chain testnet and blocks mainnet spending unless explicitly enabled in deterministic policy code.

## Connect an SSA to a Robinhood Stock Token

Stock support is an optional economic layer above the base SSA identity protocol. The agent remains portable and valid without a stock mandate.

```ts
import {
  createSSA,
  attachRobinhoodStockMandate,
  getRobinhoodStockQuote,
} from "./dist/index.js";
import { attachRobinhoodWallet } from "./dist/evm.js";

const agent = createSSA({ name: "nvidia-agent" });

// The agent owns its own Robinhood Chain wallet.
attachRobinhoodWallet(agent, {
  network: "mainnet",
  policy: { allowMainnet: false },
});

// Resolve NVDA from Robinhood's official Stock Token asset registry and
// persist the canonical Robinhood Chain contract in the public SSA manifest.
const mandate = await attachRobinhoodStockMandate(agent, "NVDA");

// Read the current underlying-equity quote from Robinhood's read-only API.
const quote = await getRobinhoodStockQuote("NVDA");

console.log(mandate.symbol);
console.log(mandate.contractAddress);
console.log(quote.bid, quote.ask);
```

Once the agent wallet actually holds the Stock Token, it can inspect its own position:

```ts
import { getRobinhoodStockPosition } from "./dist/index.js";

const position = await getRobinhoodStockPosition(agent);
console.log(position.tokenBalance);
console.log(position.quote);
```

This integration deliberately does **not** pretend to provide Robinhood brokerage access. It connects SSAs to Robinhood Chain Stock Tokens: canonical ERC-20 contracts plus Robinhood's read-only Stock Token metadata/price APIs. Acquisition, sale and jurisdictional eligibility are separate concerns and should be integrated only through compliant venues and flows.

## Public registry contract

The deployed mainnet contract source is in [`network/contracts/src/SSARegistry.sol`](./network/contracts/src/SSARegistry.sol).

Its core interface is intentionally tiny:

```solidity
register(string ssaId, string identityPublicKey, string metadataURI)
totalRegistered()
isRegistered(address wallet)
getAgent(address wallet)
```

One wallet can register once. Registration emits `SSARegistered(...)`, which makes the public population auditable from chain history.

## Heartbeats

Heartbeats are offchain and gasless. The agent signs a canonical message with its registered EVM wallet. The backend verifies the signature, checks that wallet against `SSARegistry`, rejects stale/replayed heartbeats and stores only the latest liveness timestamp.

This produces two deliberately different metrics:

- **Registered SSAs** — canonical onchain count.
- **Active SSAs · 24H** — registered wallets that produced a verified heartbeat in the last 24 hours.

## Security

Private keys and agent state must never be published to the registry or heartbeat backend. Treat `.ssa` files like wallet backups plus agent-memory backups.

Read [`protocol/SECURITY.md`](./protocol/SECURITY.md) before using the reference implementation with meaningful funds.

## What SSA 0.1 does not standardize

SSA deliberately does not standardize the model, agent reasoning loop, hosting provider, compute marketplace, token, governance system or x402 implementation.

Those can exist above or beside the protocol without bloating the identity/state layer.

## License

MIT
