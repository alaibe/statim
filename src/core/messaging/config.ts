import { accountProtocolConfigsKey, vaultDelete, vaultGet, vaultSet } from '@/storage/vault';
import { isRecord } from '@/lib/guards';
import { isProtocolId, type ProtocolId } from './namespace';

export type ProtocolConfig = Record<string, string>;

export type ConfigFieldKind = 'text' | 'secret' | 'lines';

export interface ProtocolConfigField {
  key: string;
  label: string;
  kind: ConfigFieldKind;
  placeholder?: string;
  help?: string;
  default?: string;
  required?: boolean;
}

export interface ProtocolConfigSchema {
  fields: ProtocolConfigField[];
}

export function configLines(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

export function withDefaults(schema: ProtocolConfigSchema, config: ProtocolConfig): ProtocolConfig {
  const out: ProtocolConfig = { ...config };
  for (const field of schema.fields) {
    if (field.default !== undefined && (out[field.key] ?? '') === '') {
      out[field.key] = field.default;
    }
  }
  return out;
}

export function missingFields(
  schema: ProtocolConfigSchema,
  config: ProtocolConfig
): ProtocolConfigField[] {
  const filled = withDefaults(schema, config);
  return schema.fields.filter((f) => f.required && (filled[f.key] ?? '').trim() === '');
}

export async function loadProtocolConfig(
  accountId: string,
  protocolId: ProtocolId
): Promise<ProtocolConfig> {
  return (await loadProtocolConfigs(accountId))[protocolId] ?? {};
}

export async function loadProtocolConfigs(
  accountId: string
): Promise<Partial<Record<ProtocolId, ProtocolConfig>>> {
  try {
    const raw = await vaultGet(accountProtocolConfigsKey(accountId));
    if (!raw) return {};
    const all: unknown = JSON.parse(raw);
    if (!isRecord(all)) return {};

    const out: Partial<Record<ProtocolId, ProtocolConfig>> = {};
    for (const [protocolId, parsed] of Object.entries(all)) {
      if (!isProtocolId(protocolId) || !isRecord(parsed)) continue;
      const config: ProtocolConfig = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') config[key] = value;
      }
      out[protocolId] = config;
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveProtocolConfig(
  accountId: string,
  protocolId: ProtocolId,
  config: ProtocolConfig
): Promise<void> {
  const trimmed = Object.fromEntries(
    Object.entries(config)
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value.length > 0)
  );

  const key = accountProtocolConfigsKey(accountId);
  const all = await loadProtocolConfigs(accountId);
  if (Object.keys(trimmed).length === 0) delete all[protocolId];
  else all[protocolId] = trimmed;

  if (Object.keys(all).length === 0) await vaultDelete(key);
  else await vaultSet(key, JSON.stringify(all));
}
