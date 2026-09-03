# Security

SSA capsules can contain high-value secrets. Treat every `.ssa` file like a wallet backup plus an agent-memory backup.

## v0.1 rules

- Private identity and EVM wallet keys live only inside the encrypted capsule payload.
- Never place private keys, capsule passphrases, or decrypted payloads into LLM prompts.
- The public manifest is cryptographically bound to the encrypted payload and tampering is rejected on import.
- The reference EVM adapter defaults to Robinhood Chain testnet.
- Production/mainnet spending is disabled by default and must be explicitly enabled in deterministic policy code.
- Per-transaction ETH and ERC-20 limits are checked before the wallet signs.
- For production use, verify the configured RPC reports the expected EIP-155 chain ID and use a production-grade RPC provider rather than relying on public rate-limited endpoints.
- Capsule files are written with owner-only permissions (`0600`) where supported.

## Not an audited custody system

SSA v0.1 is a reference protocol and SDK, not audited institutional wallet infrastructure. For meaningful funds, use hardened key custody, hardware-backed or programmable wallets, additional policy controls, transaction simulation, monitoring, and independent security review.
