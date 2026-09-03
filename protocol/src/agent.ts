import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  parseCapsulePayload,
  parseCapsule,
  parseManifest,
  PROTOCOL_VERSION,
  type CapsulePayload,
  type SSACapsule,
  type SSAManifest,
  type SSAWalletDescriptor,
} from "./schema.js";
import {
  createEd25519Identity,
  decryptJson,
  encryptJson,
  signWithEd25519,
  verifyWithEd25519,
} from "./crypto.js";

export type CreateSSAOptions = {
  name: string;
  state?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  capabilities?: string[];
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function manifestHash(manifest: SSAManifest): string {
  return createHash("sha256").update(stableStringify(manifest)).digest("base64url");
}

function identityId(publicKey: string): string {
  const digest = createHash("sha256").update(publicKey).digest("base64url");
  return `ssa:ed25519:${digest}`;
}

export class SovereignAgent {
  private manifestValue: SSAManifest;
  private payload: CapsulePayload;

  private constructor(manifest: SSAManifest, payload: CapsulePayload) {
    this.manifestValue = parseManifest(manifest);
    this.payload = parseCapsulePayload(payload);
  }

  static create(options: CreateSSAOptions): SovereignAgent {
    const identity = createEd25519Identity();
    const manifest: SSAManifest = {
      protocol: "ssa",
      version: PROTOCOL_VERSION,
      id: identityId(identity.publicKey),
      name: options.name,
      createdAt: new Date().toISOString(),
      identity: {
        scheme: "ed25519",
        publicKey: identity.publicKey,
      },
      wallets: [],
      capabilities: Array.from(
        new Set(["identity", "portable-state", "signing", ...(options.capabilities ?? [])]),
      ),
      metadata: options.metadata ?? {},
    };

    return new SovereignAgent(manifest, {
      manifestHash: "",
      identityPrivateKey: identity.privateKey,
      state: options.state ?? {},
      walletSecrets: [],
    });
  }

  static fromCapsule(capsule: SSACapsule, passphrase: string): SovereignAgent {
    const parsed = parseCapsule(capsule);
    const payload = parseCapsulePayload(decryptJson(parsed.encrypted, passphrase));
    if (payload.manifestHash !== manifestHash(parsed.manifest)) {
      throw new Error("SSA capsule manifest does not match its encrypted payload.");
    }
    const proof = "ssa-identity-integrity-check";
    const signature = signWithEd25519(payload.identityPrivateKey, proof);
    if (!verifyWithEd25519(parsed.manifest.identity.publicKey, proof, signature)) {
      throw new Error("SSA capsule identity private key does not match its public manifest.");
    }
    return new SovereignAgent(parsed.manifest, payload);
  }

  static async load(filePath: string, passphrase: string): Promise<SovereignAgent> {
    const raw = await readFile(filePath, "utf8");
    return SovereignAgent.fromCapsule(JSON.parse(raw), passphrase);
  }

  static async inspect(filePath: string): Promise<SSAManifest> {
    const raw = await readFile(filePath, "utf8");
    const capsule = parseCapsule(JSON.parse(raw));
    return capsule.manifest;
  }

  get manifest(): Readonly<SSAManifest> {
    return structuredClone(this.manifestValue);
  }

  get id(): string {
    return this.manifestValue.id;
  }

  get name(): string {
    return this.manifestValue.name;
  }

  getState<T = unknown>(key: string): T | undefined {
    return this.payload.state[key] as T | undefined;
  }

  getAllState(): Readonly<Record<string, unknown>> {
    return structuredClone(this.payload.state);
  }

  setState(key: string, value: unknown): this {
    this.payload.state[key] = value;
    return this;
  }

  deleteState(key: string): boolean {
    return delete this.payload.state[key];
  }

  setMetadata(key: string, value: unknown): this {
    this.manifestValue.metadata[key] = value;
    return this;
  }

  addCapability(capability: string): this {
    if (!this.manifestValue.capabilities.includes(capability)) {
      this.manifestValue.capabilities.push(capability);
    }
    return this;
  }

  sign(message: Uint8Array | string): string {
    return signWithEd25519(this.payload.identityPrivateKey, message);
  }

  verify(message: Uint8Array | string, signature: string): boolean {
    return verifyWithEd25519(this.manifestValue.identity.publicKey, message, signature);
  }

  static verifyWithManifest(
    manifest: SSAManifest,
    message: Uint8Array | string,
    signature: string,
  ): boolean {
    const parsed = parseManifest(manifest);
    return verifyWithEd25519(parsed.identity.publicKey, message, signature);
  }

  attachWallet(descriptor: SSAWalletDescriptor, secret: string): this {
    const existing = this.manifestValue.wallets.find((w) => w.id === descriptor.id);
    if (existing) {
      throw new Error(`Wallet id '${descriptor.id}' is already attached.`);
    }
    this.manifestValue.wallets.push(descriptor);
    this.payload.walletSecrets.push({ walletId: descriptor.id, secret });
    this.addCapability("payments");
    return this;
  }

  getWalletDescriptor(walletId: string): SSAWalletDescriptor | undefined {
    return this.manifestValue.wallets.find((w) => w.id === walletId);
  }

  getWalletSecret(walletId: string): string {
    const match = this.payload.walletSecrets.find((w) => w.walletId === walletId);
    if (!match) throw new Error(`No secret is stored for wallet '${walletId}'.`);
    return match.secret;
  }

  toCapsule(passphrase: string): SSACapsule {
    this.payload.manifestHash = manifestHash(this.manifestValue);
    return parseCapsule({
      format: "ssa-capsule",
      protocol: "ssa",
      version: PROTOCOL_VERSION,
      manifest: this.manifestValue,
      encrypted: encryptJson(this.payload, passphrase),
    });
  }

  async save(filePath: string, passphrase: string): Promise<void> {
    const capsule = this.toCapsule(passphrase);
    await writeFile(filePath, `${JSON.stringify(capsule, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}
