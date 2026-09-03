import {
  Contract,
  JsonRpcProvider,
  Wallet,
  formatEther,
  formatUnits,
  getAddress,
  parseEther,
  parseUnits,
} from "ethers";
import type { SovereignAgent } from "./agent.js";
import { assertEvmSpendAllowed, DEFAULT_EVM_POLICY, type EvmSpendPolicy } from "./policy.js";

export type EvmNetwork = {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl?: string;
  nativeSymbol?: string;
  isMainnet: boolean;
};

export const ROBINHOOD_MAINNET: EvmNetwork = {
  name: "robinhood-mainnet",
  chainId: 4663,
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  explorerUrl: "https://robinhoodchain.blockscout.com",
  nativeSymbol: "ETH",
  isMainnet: true,
};

export const ROBINHOOD_TESTNET: EvmNetwork = {
  name: "robinhood-testnet",
  chainId: 46630,
  rpcUrl: "https://rpc.testnet.chain.robinhood.com",
  explorerUrl: "https://explorer.testnet.chain.robinhood.com",
  nativeSymbol: "ETH",
  isMainnet: false,
};

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
] as const;

export type EvmWalletOptions = {
  id?: string;
  network?: EvmNetwork;
  policy?: Partial<EvmSpendPolicy>;
  privateKey?: string;
};

export class EvmWallet {
  readonly id: string;
  readonly network: EvmNetwork;
  readonly policy: EvmSpendPolicy;
  private readonly wallet: Wallet;

  private constructor(args: { id: string; network: EvmNetwork; policy: EvmSpendPolicy; wallet: Wallet }) {
    this.id = args.id;
    this.network = args.network;
    this.policy = args.policy;
    this.wallet = args.wallet;
  }

  static create(options: EvmWalletOptions = {}): EvmWallet {
    const network = options.network ?? ROBINHOOD_TESTNET;
    const wallet = options.privateKey ? new Wallet(options.privateKey) : new Wallet(Wallet.createRandom().privateKey);
    return new EvmWallet({
      id: options.id ?? "evm-primary",
      network,
      wallet,
      policy: { ...DEFAULT_EVM_POLICY, ...(options.policy ?? {}) },
    });
  }

  static fromAgent(agent: SovereignAgent, walletId = "evm-primary", options: { rpcUrl?: string; policy?: Partial<EvmSpendPolicy> } = {}): EvmWallet {
    const descriptor = agent.getWalletDescriptor(walletId);
    if (!descriptor) throw new Error(`SSA wallet '${walletId}' is not attached.`);
    if (descriptor.chain !== "eip155" || !descriptor.chainId) throw new Error(`SSA wallet '${walletId}' is not an EIP-155 wallet.`);
    const known = descriptor.chainId === ROBINHOOD_MAINNET.chainId ? ROBINHOOD_MAINNET : descriptor.chainId === ROBINHOOD_TESTNET.chainId ? ROBINHOOD_TESTNET : undefined;
    const rpcUrl = options.rpcUrl ?? known?.rpcUrl;
    if (!rpcUrl) throw new Error(`No RPC URL is known for EVM chain ${descriptor.chainId}; pass { rpcUrl } to EvmWallet.fromAgent().`);
    return EvmWallet.create({
      id: walletId,
      privateKey: agent.getWalletSecret(walletId),
      network: {
        name: descriptor.network,
        chainId: descriptor.chainId,
        rpcUrl,
        explorerUrl: known?.explorerUrl,
        nativeSymbol: "ETH",
        isMainnet: known?.isMainnet ?? true,
      },
      policy: options.policy,
    });
  }

  get address(): string { return this.wallet.address; }

  private provider(): JsonRpcProvider {
    return new JsonRpcProvider(this.network.rpcUrl, { name: this.network.name, chainId: this.network.chainId });
  }

  private signer(): Wallet { return this.wallet.connect(this.provider()); }

  attachTo(agent: SovereignAgent): this {
    agent.attachWallet({
      id: this.id,
      chain: "eip155",
      chainId: this.network.chainId,
      network: this.network.name,
      address: this.address,
      assetSupport: ["ETH", "ERC20"],
    }, this.wallet.privateKey);
    return this;
  }

  async assertConnectedNetwork(): Promise<void> {
    const detected = await this.provider().getNetwork();
    if (detected.chainId !== BigInt(this.network.chainId)) throw new Error(`RPC chain mismatch: expected ${this.network.chainId}, received ${detected.chainId.toString()}.`);
  }

  async getEthBalance(): Promise<number> {
    await this.assertConnectedNetwork();
    return Number(formatEther(await this.provider().getBalance(this.address)));
  }

  async sendEth(to: string, amountEth: number): Promise<string> {
    assertEvmSpendAllowed({ chainId: this.network.chainId, isMainnet: this.network.isMainnet, kind: "eth", amount: amountEth, policy: this.policy });
    await this.assertConnectedNetwork();
    const receipt = await (await this.signer().sendTransaction({ to: getAddress(to), value: parseEther(amountEth.toString()) })).wait();
    if (!receipt) throw new Error("ETH transfer was broadcast but no receipt was returned.");
    return receipt.hash;
  }

  async getTokenBalance(tokenAddress: string): Promise<{ balance: number; decimals: number; symbol: string }> {
    await this.assertConnectedNetwork();
    const token = new Contract(getAddress(tokenAddress), ERC20_ABI, this.provider());
    const [raw, decimals, symbol] = await Promise.all([
      token.balanceOf(this.address) as Promise<bigint>,
      token.decimals() as Promise<bigint>,
      token.symbol() as Promise<string>,
    ]);
    const d = Number(decimals);
    return { balance: Number(formatUnits(raw, d)), decimals: d, symbol };
  }

  async transferToken(args: { token: string; to: string; amount: number }): Promise<string> {
    assertEvmSpendAllowed({ chainId: this.network.chainId, isMainnet: this.network.isMainnet, kind: "token", amount: args.amount, token: args.token, policy: this.policy });
    await this.assertConnectedNetwork();
    const contract = new Contract(getAddress(args.token), ERC20_ABI, this.signer());
    const decimals = Number(await contract.decimals());
    const receipt = await (await contract.transfer(getAddress(args.to), parseUnits(args.amount.toString(), decimals))).wait();
    if (!receipt) throw new Error("ERC-20 transfer was broadcast but no receipt was returned.");
    return receipt.hash;
  }
}

export function attachEvmWallet(agent: SovereignAgent, options: EvmWalletOptions = {}): EvmWallet {
  const wallet = EvmWallet.create(options);
  wallet.attachTo(agent);
  return wallet;
}

export function attachRobinhoodWallet(agent: SovereignAgent, options: Omit<EvmWalletOptions, "network"> & { network?: "testnet" | "mainnet" } = {}): EvmWallet {
  return attachEvmWallet(agent, {
    ...options,
    network: options.network === "mainnet" ? ROBINHOOD_MAINNET : ROBINHOOD_TESTNET,
  });
}
