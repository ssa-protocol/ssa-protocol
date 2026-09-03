export type HeartbeatMessageInput = {
  chainId: number;
  registryAddress: string;
  wallet: string;
  ssaId: string;
  timestamp: number;
  nonce: string;
};

export function buildHeartbeatMessage(input: HeartbeatMessageInput): string {
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) throw new Error("chainId must be a positive safe integer");
  if (!Number.isSafeInteger(input.timestamp) || input.timestamp <= 0) throw new Error("timestamp must be a positive integer in milliseconds");
  if (!input.registryAddress || !input.wallet || !input.ssaId || !input.nonce) throw new Error("registryAddress, wallet, ssaId and nonce are required");

  return [
    "SSA_HEARTBEAT_V1",
    `chainId:${input.chainId}`,
    `registry:${input.registryAddress.toLowerCase()}`,
    `wallet:${input.wallet.toLowerCase()}`,
    `ssaId:${input.ssaId}`,
    `timestamp:${input.timestamp}`,
    `nonce:${input.nonce}`,
  ].join("\n");
}
