import { accountProtocolConfigsKey, accountScopedKeys, vaultGet, vaultSet } from '@/storage/vault';
import {
  configLines,
  loadProtocolConfig,
  missingFields,
  saveProtocolConfig,
  withDefaults,
  type ProtocolConfigSchema,
} from './config';
import { effectiveConfig, isConfigured } from './registry';
import { protocolById } from '@/protocols';

const SCHEMA: ProtocolConfigSchema = {
  fields: [
    { key: 'nodeUrl', label: 'Node', kind: 'text', required: true },
    { key: 'relays', label: 'Relays', kind: 'lines', default: 'wss://a\nwss://b' },
    { key: 'secret', label: 'Secret', kind: 'secret' },
  ],
};

describe('storage', () => {
  it('round-trips per account, so two accounts do not share credentials', async () => {
    await saveProtocolConfig('acct-a', 'status', { nodeUrl: 'http://a' });
    await saveProtocolConfig('acct-b', 'status', { nodeUrl: 'http://b' });

    expect(await loadProtocolConfig('acct-a', 'status')).toEqual({ nodeUrl: 'http://a' });
    expect(await loadProtocolConfig('acct-b', 'status')).toEqual({ nodeUrl: 'http://b' });
  });

  it('lives in the keychain, because these are real credentials', async () => {
    await saveProtocolConfig('acct-a', 'status', { nodeUrl: 'secret-value' });
    expect(await vaultGet(accountProtocolConfigsKey('acct-a'))).toContain('secret-value');
  });

  it('uses one account key, so wiping does not need to know protocol ids', () => {
    const keys = accountScopedKeys('acct-a');
    expect(keys).toContain(accountProtocolConfigsKey('acct-a'));
  });

  it('drops blank values instead of storing them', async () => {
    await saveProtocolConfig('acct-a', 'status', { nodeUrl: '  ', pubsubTopic: '/x' });
    expect(await loadProtocolConfig('acct-a', 'status')).toEqual({ pubsubTopic: '/x' });
  });

  it('deletes the entry when everything is cleared', async () => {
    await saveProtocolConfig('acct-a', 'status', { nodeUrl: 'http://x' });
    await saveProtocolConfig('acct-a', 'status', { nodeUrl: '' });
    expect(await loadProtocolConfig('acct-a', 'status')).toEqual({});
  });

  it('returns an empty config rather than throwing on corrupt data', async () => {
    await vaultSet(accountProtocolConfigsKey('acct-a'), 'not json');
    expect(await loadProtocolConfig('acct-a', 'nostr')).toEqual({});
  });
});

describe('defaults and validation', () => {
  it('fills unset fields but never overwrites a typed value', () => {
    expect(withDefaults(SCHEMA, {})).toEqual({ relays: 'wss://a\nwss://b' });
    expect(withDefaults(SCHEMA, { relays: 'wss://mine' }).relays).toBe('wss://mine');
  });

  it('reports missing required fields', () => {
    expect(missingFields(SCHEMA, {}).map((f) => f.key)).toEqual(['nodeUrl']);
    expect(missingFields(SCHEMA, { nodeUrl: 'http://x' })).toEqual([]);
  });

  it('splits a lines field, ignoring blanks and comments', () => {
    expect(configLines('wss://a\n\n# a note\nwss://b , wss://c ')).toEqual([
      'wss://a',
      'wss://b',
      'wss://c',
    ]);
    expect(configLines(undefined)).toEqual([]);
  });
});

describe('the registry', () => {
  it('ships public relay defaults for Nostr, which are infrastructure not secrets', () => {
    const nostr = protocolById('nostr')!;
    const relays = configLines(effectiveConfig(nostr, {}).relays);
    expect(relays.length).toBeGreaterThan(0);
    expect(relays.every((r) => r.startsWith('wss://'))).toBe(true);
    expect(isConfigured(nostr, effectiveConfig(nostr, {}))).toBe(true);
  });

  it("needs no node for Status, which goes through Status's own unless given one", () => {
    const status = protocolById('status')!;
    expect(effectiveConfig(status, {}).nodeUrl).toBeUndefined();
    expect(isConfigured(status, effectiveConfig(status, {}))).toBe(true);
    expect(isConfigured(status, { nodeUrl: 'http://127.0.0.1:8645' })).toBe(true);
  });

  it('distinguishes the group models honestly', () => {
    expect(protocolById('xmtp')!.meta.properties.groupModel).toBe('enforced');
    expect(protocolById('nostr')!.meta.properties.groupModel).toBe('participant-set');
    expect(protocolById('status')!.meta.properties.groupModel).toBe('enforced');
  });
});
