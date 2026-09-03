import { Contract, JsonRpcProvider, Wallet, getAddress } from "ethers";
import type { SovereignAgent } from "@ssa/protocol";
import { buildHeartbeatMessage, type HeartbeatMessageInput } from "./message.js";

export { buildHeartbeatMessage, type HeartbeatMessageInput } from "./message.js";

const REGISTRY_ABI = [
  "function register(string ssaId, string identityPublicKey, string metadataURI)",
  "function totalRegistered() view returns (uint256)",
  "function isRegistered(address wallet) view returns (bool)",
  "function getAgent(address wallet) view returns (string ssaId, bytes32 identityHash, string identityPublicKey, string metadataURI, uint64 registeredAt)",
] as const;

export type NetworkConfig = {
  chainId: number;
  rpcUrl: string;
  registryAddress: string;
  heartbeatUrl?: string;
  isMainnet?: boolean;
};

export const ROBINHOOD_NETWORKS = {
  testnet: { chainId: 46630, rpcUrl: "https://rpc.testnet.chain.robinhood.com", isMainnet: false },
  mainnet: { chainId: 4663, rpcUrl: "https://rpc.mainnet.chain.robinhood.com", isMainnet: true },
} as const;

function signerForAgent(agent: SovereignAgent, walletId: string, rpcUrl: string): Wallet {
  const descriptor = agent.getWalletDescriptor(walletId);
  if (!descriptor) throw new Error(`SSA wallet '${walletId}' is not attached.`);
  if (descriptor.chain !== "eip155" || !descriptor.chainId) throw new Error(`SSA wallet '${walletId}' is not an EIP-155 wallet.`);
  const provider = new JsonRpcProvider(rpcUrl, descriptor.chainId);
  return new Wallet(agent.getWalletSecret(walletId), provider);
}

async function assertChain(provider: JsonRpcProvider, expectedChainId: number): Promise<void> {
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(expectedChainId)) throw new Error(`RPC chain mismatch: expected ${expectedChainId}, received ${network.chainId.toString()}.`);
}

export async function registerSSA(args: {
  agent: SovereignAgent;
  config: NetworkConfig;
  walletId?: string;
  metadataURI?: string;
  allowMainnet?: boolean;
}): Promise<{ transactionHash: string; wallet: string }> {
  const walletId = args.walletId ?? "evm-primary";
  if (args.config.isMainnet && !args.allowMainnet) throw new Error("Mainnet registration requires allowMainnet: true.");
  const signer = signerForAgent(args.agent, walletId, args.config.rpcUrl);
  await assertChain(signer.provider as JsonRpcProvider, args.config.chainId);
  const descriptor = args.agent.getWalletDescriptor(walletId)!;
  if (descriptor.chainId !== args.config.chainId) throw new Error(`SSA wallet is configured for chain ${descriptor.chainId}, not ${args.config.chainId}.`);
  const contract = new Contract(getAddress(args.config.registryAddress), REGISTRY_ABI, signer);
  if (await contract.isRegistered(signer.address) as boolean) throw new Error("This SSA wallet is already registered.");
  const tx = await contract.register(args.agent.id, args.agent.manifest.identity.publicKey, args.metadataURI ?? "");
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Registration was broadcast but no receipt was returned.");
  return { transactionHash: receipt.hash, wallet: signer.address };
}

export async function createSignedHeartbeat(args: {
  agent: SovereignAgent;
  config: NetworkConfig;
  walletId?: string;
  now?: number;
  nonce?: string;
}): Promise<{
  ssaId: string;
  wallet: string;
  chainId: number;
  registryAddress: string;
  timestamp: number;
  nonce: string;
  signature: string;
}> {
  const walletId = args.walletId ?? "evm-primary";
  const signer = signerForAgent(args.agent, walletId, args.config.rpcUrl);
  const descriptor = args.agent.getWalletDescriptor(walletId)!;
  if (descriptor.chainId !== args.config.chainId) throw new Error("Heartbeat network does not match the SSA wallet network.");
  const timestamp = args.now ?? Date.now();
  const nonce = args.nonce ?? crypto.randomUUID();
  const message = buildHeartbeatMessage({
    chainId: args.config.chainId,
    registryAddress: getAddress(args.config.registryAddress),
    wallet: signer.address,
    ssaId: args.agent.id,
    timestamp,
    nonce,
  });
  return {
    ssaId: args.agent.id,
    wallet: signer.address,
    chainId: args.config.chainId,
    registryAddress: getAddress(args.config.registryAddress),
    timestamp,
    nonce,
    signature: await signer.signMessage(message),
  };
}

export async function heartbeat(args: {
  agent: SovereignAgent;
  config: NetworkConfig;
  walletId?: string;
}): Promise<{ ok: true; lastSeen: string }> {
  if (!args.config.heartbeatUrl) throw new Error("Network config is missing heartbeatUrl.");
  const payload = await createSignedHeartbeat(args);
  const response = await fetch(args.config.heartbeatUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Heartbeat failed (${response.status}): ${JSON.stringify(body)}`);
  return body as { ok: true; lastSeen: string };
}
