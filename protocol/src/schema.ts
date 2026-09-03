export const PROTOCOL_VERSION = "0.1" as const;

export type SSAIdentity = { scheme: "ed25519"; publicKey: string };
export type SSAWalletDescriptor = { id: string; chain: string; network: string; chainId?: number; address: string; assetSupport: string[] };
export type SSAManifest = { protocol: "ssa"; version: typeof PROTOCOL_VERSION; id: string; name: string; createdAt: string; identity: SSAIdentity; wallets: SSAWalletDescriptor[]; capabilities: string[]; metadata: Record<string, unknown> };
export type EncryptedEnvelope = { algorithm: "aes-256-gcm"; kdf: "scrypt"; salt: string; iv: string; tag: string; ciphertext: string };
export type WalletSecret = { walletId: string; secret: string };
export type CapsulePayload = { manifestHash: string; identityPrivateKey: string; state: Record<string, unknown>; walletSecrets: WalletSecret[] };
export type SSACapsule = { format: "ssa-capsule"; protocol: "ssa"; version: typeof PROTOCOL_VERSION; manifest: SSAManifest; encrypted: EncryptedEnvelope };

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid SSA data: '${key}' must be a non-empty string.`);
  return value;
}

export function parseManifest(value: unknown): SSAManifest {
  if (!isRecord(value)) throw new Error("Invalid SSA manifest.");
  if (value.protocol !== "ssa" || value.version !== PROTOCOL_VERSION) throw new Error(`Unsupported SSA protocol version. Expected ${PROTOCOL_VERSION}.`);
  const id = requireString(value, "id");
  if (!id.startsWith("ssa:ed25519:")) throw new Error("Invalid SSA identity id.");
  const name = requireString(value, "name");
  if (name.length > 80) throw new Error("SSA name must be 80 characters or fewer.");
  const createdAt = requireString(value, "createdAt");
  if (Number.isNaN(Date.parse(createdAt))) throw new Error("Invalid SSA createdAt timestamp.");
  if (!isRecord(value.identity) || value.identity.scheme !== "ed25519") throw new Error("Invalid SSA identity.");
  const publicKey = requireString(value.identity, "publicKey");
  const walletsRaw = value.wallets ?? [];
  if (!Array.isArray(walletsRaw)) throw new Error("Invalid SSA wallets.");
  const wallets = walletsRaw.map((wallet): SSAWalletDescriptor => {
    if (!isRecord(wallet)) throw new Error("Invalid SSA wallet descriptor.");
    const assetSupport = wallet.assetSupport ?? [];
    if (!Array.isArray(assetSupport) || assetSupport.some((item) => typeof item !== "string")) throw new Error("Invalid SSA wallet assetSupport.");
    return { id: requireString(wallet, "id"), chain: requireString(wallet, "chain"), network: requireString(wallet, "network"), chainId: typeof wallet.chainId === "number" && Number.isSafeInteger(wallet.chainId) && wallet.chainId > 0 ? wallet.chainId : undefined, address: requireString(wallet, "address"), assetSupport: [...assetSupport] as string[] };
  });
  const capabilitiesRaw = value.capabilities ?? [];
  if (!Array.isArray(capabilitiesRaw) || capabilitiesRaw.some((item) => typeof item !== "string")) throw new Error("Invalid SSA capabilities.");
  const metadataRaw = value.metadata ?? {};
  if (!isRecord(metadataRaw)) throw new Error("Invalid SSA metadata.");
  return { protocol: "ssa", version: PROTOCOL_VERSION, id, name, createdAt, identity: { scheme: "ed25519", publicKey }, wallets, capabilities: [...capabilitiesRaw] as string[], metadata: { ...metadataRaw } };
}

export function parseEncryptedEnvelope(value: unknown): EncryptedEnvelope {
  if (!isRecord(value)) throw new Error("Invalid encrypted SSA payload.");
  if (value.algorithm !== "aes-256-gcm" || value.kdf !== "scrypt") throw new Error("Unsupported SSA capsule encryption format.");
  return { algorithm: "aes-256-gcm", kdf: "scrypt", salt: requireString(value, "salt"), iv: requireString(value, "iv"), tag: requireString(value, "tag"), ciphertext: requireString(value, "ciphertext") };
}

export function parseCapsulePayload(value: unknown): CapsulePayload {
  if (!isRecord(value)) throw new Error("Invalid SSA private payload.");
  const state = value.state ?? {};
  const walletSecrets = value.walletSecrets ?? [];
  if (!isRecord(state)) throw new Error("Invalid SSA state payload.");
  if (!Array.isArray(walletSecrets)) throw new Error("Invalid SSA wallet secrets.");
  return { manifestHash: typeof value.manifestHash === "string" ? value.manifestHash : "", identityPrivateKey: requireString(value, "identityPrivateKey"), state: { ...state }, walletSecrets: walletSecrets.map((entry): WalletSecret => { if (!isRecord(entry)) throw new Error("Invalid SSA wallet secret record."); return { walletId: requireString(entry, "walletId"), secret: requireString(entry, "secret") }; }) };
}

export function parseCapsule(value: unknown): SSACapsule {
  if (!isRecord(value)) throw new Error("Invalid SSA capsule.");
  if (value.format !== "ssa-capsule" || value.protocol !== "ssa" || value.version !== PROTOCOL_VERSION) throw new Error(`Unsupported SSA capsule. Expected SSA ${PROTOCOL_VERSION}.`);
  return { format: "ssa-capsule", protocol: "ssa", version: PROTOCOL_VERSION, manifest: parseManifest(value.manifest), encrypted: parseEncryptedEnvelope(value.encrypted) };
}
