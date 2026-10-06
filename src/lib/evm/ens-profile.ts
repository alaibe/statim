import type { Address } from 'viem';
import { mainnet } from 'viem/chains';

import { publicClientFor } from './chains';
import { lookupName } from './ens';
import { ensProfiles, type StoredEnsProfile } from './ens-cache';
import { viemEns } from './viem-ens';

const BASE_REGISTRAR = '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85' as const;

const NAME_EXPIRES_ABI = [
  {
    name: 'nameExpires',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

async function ensPaidUntil(name: string): Promise<Date | null> {
  const parts = name.toLowerCase().split('.');
  if (parts.length !== 2 || parts[1] !== 'eth') return null;

  try {
    const { labelhash } = viemEns();
    const expiry = await ensClient().readContract({
      address: BASE_REGISTRAR,
      abi: NAME_EXPIRES_ABI,
      functionName: 'nameExpires',
      args: [BigInt(labelhash(parts[0]))],
    });
    return expiry > 0n ? new Date(Number(expiry) * 1000) : null;
  } catch {
    return null;
  }
}

interface EnsProfile {
  name: string;
  avatar: string | null;
  description: string | null;
  url: string | null;
  paidUntil: Date | null;
}

function ensClient() {
  return publicClientFor(mainnet.id);
}

const TEXT_KEYS = ['description', 'url'] as const;

export async function resolveEnsProfile(address: Address): Promise<EnsProfile | null> {
  try {
    const stored = await ensProfiles.load(address.toLowerCase(), () => fetchProfile(address));
    return stored && { ...stored, paidUntil: stored.paidUntil ? new Date(stored.paidUntil) : null };
  } catch {
    return null;
  }
}

async function fetchProfile(address: Address): Promise<StoredEnsProfile | null> {
  const name = await lookupName(address);
  if (!name) return null;

  const normalized = viemEns().normalize(name);
  const client = ensClient();

  const [avatar, description, url, paidUntil] = await Promise.all([
    client.getEnsAvatar({ name: normalized }).catch(() => null),
    client.getEnsText({ name: normalized, key: TEXT_KEYS[0] }).catch(() => null),
    client.getEnsText({ name: normalized, key: TEXT_KEYS[1] }).catch(() => null),
    ensPaidUntil(name).catch(() => null),
  ]);

  return {
    name,
    avatar: avatar ?? null,
    description,
    url,
    paidUntil: paidUntil?.getTime() ?? null,
  };
}
