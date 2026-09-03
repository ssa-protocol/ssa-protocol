export type EvmSpendPolicy = {
  allowMainnet: boolean;
  maxEthPerTransaction: number;
  maxTokenUiAmountPerTransaction: number;
  allowedTokenContracts?: string[];
  allowedChainIds?: number[];
};

export const DEFAULT_EVM_POLICY: EvmSpendPolicy = {
  allowMainnet: false,
  maxEthPerTransaction: 0.01,
  maxTokenUiAmountPerTransaction: 5,
};

export function assertEvmSpendAllowed(args: {
  chainId: number;
  isMainnet: boolean;
  kind: "eth" | "token";
  amount: number;
  token?: string;
  policy: EvmSpendPolicy;
}): void {
  const { chainId, isMainnet, kind, amount, token, policy } = args;
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("EVM chain id must be a positive safe integer.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Transfer amount must be a positive finite number.");
  if (isMainnet && !policy.allowMainnet) throw new Error("Mainnet spending is disabled by this SSA wallet policy.");
  if (policy.allowedChainIds?.length && !policy.allowedChainIds.includes(chainId)) throw new Error(`EVM chain ${chainId} is not allowed by this SSA wallet policy.`);
  if (kind === "eth" && amount > policy.maxEthPerTransaction) throw new Error(`ETH transfer exceeds policy limit of ${policy.maxEthPerTransaction} ETH.`);
  if (kind === "token" && amount > policy.maxTokenUiAmountPerTransaction) throw new Error(`Token transfer exceeds policy limit of ${policy.maxTokenUiAmountPerTransaction} UI units.`);
  if (kind === "token" && policy.allowedTokenContracts?.length) {
    const normalized = token?.toLowerCase();
    const allowed = policy.allowedTokenContracts.map((address) => address.toLowerCase());
    if (!normalized || !allowed.includes(normalized)) throw new Error("ERC-20 contract is not allowed by this SSA wallet policy.");
  }
}
