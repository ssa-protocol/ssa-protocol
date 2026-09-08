import type { SovereignAgent } from "./agent.js";
import { EvmWallet, ROBINHOOD_MAINNET } from "./evm.js";

const ROBINHOOD_STOCK_API = "https://api.robinhood.com/rhj";
const STOCK_METADATA_KEY = "robinhoodStockToken";

export type RobinhoodStockDeployment = {
  contractAddress: string;
  chainId: number;
  networkName?: string;
};

export type RobinhoodStockAsset = {
  id: string;
  tokenSymbol: string;
  tokenName: string;
  deployments: RobinhoodStockDeployment[];
  currentMultiplier: string;
  pendingMultiplier: string;
  pendingMultiplierEffectiveTime?: string;
  logoUrl?: string;
  tradingCapabilities?: Record<string, unknown>;
  status: string;
  tokenDecimals?: number;
  isin?: string;
};

export type RobinhoodStockQuote = {
  tokenSymbol: string;
  deployments: RobinhoodStockDeployment[];
  bid: string;
  ask: string;
  currency: string;
  dailyTradingVolume: string;
  isTradingHalt: boolean;
  generatedAt: string;
};

export type RobinhoodStockMandate = {
  provider: "Robinhood";
  product: "Stock Token";
  symbol: string;
  assetId: string;
  tokenName: string;
  chainId: typeof ROBINHOOD_MAINNET.chainId;
  contractAddress: string;
  currentMultiplier: string;
  logoUrl?: string;
  status: string;
  attachedAt: string;
};

export type RobinhoodStockPosition = {
  mandate: RobinhoodStockMandate;
  tokenBalance: number;
  tokenDecimals: number;
  onchainSymbol: string;
  quote: RobinhoodStockQuote;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid Robinhood Stock Token response: '${key}' is missing.`);
  }
  return value;
}

function parseDeployment(value: unknown): RobinhoodStockDeployment {
  if (!isRecord(value)) throw new Error("Invalid Robinhood Stock Token deployment.");
  const chainId = value.chainId;
  if (typeof chainId !== "number" || !Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("Invalid Robinhood Stock Token deployment chainId.");
  }
  return {
    contractAddress: requiredString(value, "contractAddress"),
    chainId,
    networkName: typeof value.networkName === "string" ? value.networkName : undefined,
  };
}

function parseDeployments(value: unknown): RobinhoodStockDeployment[] {
  if (!Array.isArray(value)) throw new Error("Invalid Robinhood Stock Token deployments.");
  return value.map(parseDeployment);
}

function parseAsset(value: unknown): RobinhoodStockAsset {
  if (!isRecord(value)) throw new Error("Invalid Robinhood Stock Token asset.");
  return {
    id: requiredString(value, "id"),
    tokenSymbol: requiredString(value, "tokenSymbol"),
    tokenName: requiredString(value, "tokenName"),
    deployments: parseDeployments(value.deployments),
    currentMultiplier: requiredString(value, "currentMultiplier"),
    pendingMultiplier: typeof value.pendingMultiplier === "string" ? value.pendingMultiplier : "",
    pendingMultiplierEffectiveTime:
      typeof value.pendingMultiplierEffectiveTime === "string" ? value.pendingMultiplierEffectiveTime : undefined,
    logoUrl: typeof value.logoUrl === "string" ? value.logoUrl : undefined,
    tradingCapabilities: isRecord(value.tradingCapabilities) ? { ...value.tradingCapabilities } : undefined,
    status: requiredString(value, "status"),
    tokenDecimals:
      typeof value.tokenDecimals === "number" && Number.isSafeInteger(value.tokenDecimals)
        ? value.tokenDecimals
        : undefined,
    isin: typeof value.isin === "string" ? value.isin : undefined,
  };
}

function parseQuote(value: unknown): RobinhoodStockQuote {
  if (!isRecord(value)) throw new Error("Invalid Robinhood Stock Token quote.");
  return {
    tokenSymbol: requiredString(value, "tokenSymbol"),
    deployments: parseDeployments(value.deployments),
    bid: requiredString(value, "bid"),
    ask: requiredString(value, "ask"),
    currency: requiredString(value, "currency"),
    dailyTradingVolume: requiredString(value, "dailyTradingVolume"),
    isTradingHalt: value.isTradingHalt === true,
    generatedAt: requiredString(value, "generatedAt"),
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Robinhood Stock Token API request failed (${response.status} ${response.statusText}).`);
  }
  return response.json() as Promise<unknown>;
}

function normalizeSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized || !/^[A-Z0-9.-]{1,16}$/.test(normalized)) {
    throw new Error("Invalid stock symbol.");
  }
  return normalized;
}

function mainnetDeployment(asset: RobinhoodStockAsset): RobinhoodStockDeployment {
  const deployment = asset.deployments.find((item) => item.chainId === ROBINHOOD_MAINNET.chainId);
  if (!deployment) {
    throw new Error(`${asset.tokenSymbol} does not have a Robinhood Chain mainnet Stock Token deployment.`);
  }
  return deployment;
}

export async function listRobinhoodStockTokens(): Promise<RobinhoodStockAsset[]> {
  const payload = await fetchJson(`${ROBINHOOD_STOCK_API}/assets`);
  if (!isRecord(payload) || !Array.isArray(payload.assets)) {
    throw new Error("Invalid Robinhood Stock Token assets response.");
  }
  return payload.assets.map(parseAsset);
}

export async function getRobinhoodStockToken(symbol: string): Promise<RobinhoodStockAsset> {
  const normalized = normalizeSymbol(symbol);
  const assets = await listRobinhoodStockTokens();
  const asset = assets.find((item) => item.tokenSymbol.toUpperCase() === normalized);
  if (!asset) throw new Error(`No Robinhood Stock Token found for '${normalized}'.`);
  return asset;
}

export async function getRobinhoodStockQuote(symbol: string): Promise<RobinhoodStockQuote> {
  const normalized = normalizeSymbol(symbol);
  const payload = await fetchJson(`${ROBINHOOD_STOCK_API}/prices/${encodeURIComponent(normalized)}`);
  if (!isRecord(payload) || !Array.isArray(payload.quotes) || payload.quotes.length === 0) {
    throw new Error(`No Robinhood Stock Token quote found for '${normalized}'.`);
  }
  return parseQuote(payload.quotes[0]);
}

export async function attachRobinhoodStockMandate(
  agent: SovereignAgent,
  symbol: string,
): Promise<RobinhoodStockMandate> {
  const asset = await getRobinhoodStockToken(symbol);
  const deployment = mainnetDeployment(asset);
  const mandate: RobinhoodStockMandate = {
    provider: "Robinhood",
    product: "Stock Token",
    symbol: asset.tokenSymbol,
    assetId: asset.id,
    tokenName: asset.tokenName,
    chainId: ROBINHOOD_MAINNET.chainId,
    contractAddress: deployment.contractAddress,
    currentMultiplier: asset.currentMultiplier,
    logoUrl: asset.logoUrl,
    status: asset.status,
    attachedAt: new Date().toISOString(),
  };
  agent.setMetadata(STOCK_METADATA_KEY, mandate);
  agent.addCapability("robinhood-stock-token");
  return mandate;
}

export function getRobinhoodStockMandate(agent: SovereignAgent): RobinhoodStockMandate | undefined {
  const value = agent.manifest.metadata[STOCK_METADATA_KEY];
  if (!isRecord(value)) return undefined;
  if (
    value.provider !== "Robinhood" ||
    value.product !== "Stock Token" ||
    typeof value.symbol !== "string" ||
    typeof value.assetId !== "string" ||
    typeof value.tokenName !== "string" ||
    value.chainId !== ROBINHOOD_MAINNET.chainId ||
    typeof value.contractAddress !== "string" ||
    typeof value.currentMultiplier !== "string" ||
    typeof value.status !== "string" ||
    typeof value.attachedAt !== "string"
  ) {
    return undefined;
  }
  return {
    provider: "Robinhood",
    product: "Stock Token",
    symbol: value.symbol,
    assetId: value.assetId,
    tokenName: value.tokenName,
    chainId: ROBINHOOD_MAINNET.chainId,
    contractAddress: value.contractAddress,
    currentMultiplier: value.currentMultiplier,
    logoUrl: typeof value.logoUrl === "string" ? value.logoUrl : undefined,
    status: value.status,
    attachedAt: value.attachedAt,
  };
}

export async function getRobinhoodStockPosition(
  agent: SovereignAgent,
  options: { walletId?: string; rpcUrl?: string } = {},
): Promise<RobinhoodStockPosition> {
  const mandate = getRobinhoodStockMandate(agent);
  if (!mandate) throw new Error("SSA does not have a Robinhood Stock Token mandate attached.");

  const wallet = EvmWallet.fromAgent(agent, options.walletId ?? "evm-primary", {
    rpcUrl: options.rpcUrl,
  });
  if (wallet.network.chainId !== ROBINHOOD_MAINNET.chainId) {
    throw new Error("Robinhood Stock Token positions require an SSA wallet on Robinhood Chain mainnet.");
  }

  const [balance, quote] = await Promise.all([
    wallet.getTokenBalance(mandate.contractAddress),
    getRobinhoodStockQuote(mandate.symbol),
  ]);

  return {
    mandate,
    tokenBalance: balance.balance,
    tokenDecimals: balance.decimals,
    onchainSymbol: balance.symbol,
    quote,
  };
}
