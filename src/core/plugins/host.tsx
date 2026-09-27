import { router } from 'expo-router';
import { createContext, use, useState } from 'react';
import { openExternal } from '@/lib/open-url';

import { capabilitiesOf } from '../account/account-kind';
import type { Keyring } from '../account/keyring';
import { groupCommands, groupComposerActions } from '../commands/group';
import { pollCommand } from '../commands/poll';
import { sessionFor, useChatStore, xmtpSessionFor } from '../messaging/chat-store';
import { chatScope } from '../messaging/chat-scope';
import { notifyLiveViews } from './live';
import { PluginRegistry, worksOn } from './registry';
import type {
  Plugin,
  PluginContext,
  PluginId,
  PluginLease,
  PluginPermission,
  PluginUiApi,
} from './types';
import { accountRuntime } from '@/runtime';
import type { AccountStorage } from '@/storage/account';

const PLUGIN_PROTOCOL = 'xmtp';

export interface PluginHostValue {
  registry: PluginRegistry;
  enabledIds: PluginId[];
  defaultEnabled: PluginId[];
  makeContext(
    plugin: Plugin,
    accountId: string,
    keyring: Keyring,
    storage: AccountStorage,
    lease: PluginLease
  ): PluginContext;
  onPluginsChanged(ids: PluginId[]): void;
  setEnabled(id: PluginId, enabled: boolean): Promise<void>;
  handleUri(url: string): Promise<boolean>;
}

const PluginHostContext = createContext<PluginHostValue | null>(null);

export function usePluginRegistry(): PluginRegistry | undefined {
  return use(PluginHostContext)?.registry;
}

export function usePluginHost(): PluginHostValue {
  const value = use(PluginHostContext);
  if (!value) throw new Error('usePluginHost must be used inside <PluginProvider>');
  return value;
}

export type HostUi = Pick<PluginUiApi, 'notify' | 'openChat' | 'openSettings'>;

export interface PluginProviderProps {
  plugins: Plugin[];
  defaultEnabled?: PluginId[];
  ui: HostUi;
  children: React.ReactNode;
}

function makePluginContext(
  registry: PluginRegistry,
  ui: HostUi,
  plugin: Plugin,
  accountId: string,
  keyring: Keyring,
  storage: AccountStorage,
  lease: PluginLease
): PluginContext {
  const manifest = plugin.manifest;
  const pluginStorage = storage.plugin(manifest.id);
  const active = () => lease.assertActive();
  const guard = lease.guard;
  const require = (permission: PluginPermission) => {
    if (!manifest.permissions.includes(permission)) {
      throw new Error(`Plugin "${manifest.id}" used ${permission} without declaring it.`);
    }
  };
  const accountChat = () => {
    active();
    const chat = useChatStore.getState();
    if (chat.accountId !== accountId)
      throw new Error(`Plugin "${manifest.id}" is no longer active.`);
    return chat;
  };

  return {
    manifest,
    storage: {
      async get(key) {
        require('storage');
        return guard(() => pluginStorage.get(key));
      },
      async set(key, value) {
        require('storage');
        await guard(() => pluginStorage.set(key, value));
        notifyLiveViews(manifest.id);
      },
      async remove(key) {
        require('storage');
        await guard(() => pluginStorage.remove(key));
        notifyLiveViews(manifest.id);
      },
    },

    account: {
      get accountId() {
        active();
        return accountId;
      },
      get capabilities() {
        active();
        return capabilitiesOf(keyring.kind);
      },
      get address() {
        active();
        return keyring.address;
      },
      get participantId() {
        return xmtpSessionFor(accountChat())?.self.participantId ?? '';
      },
      async signMessage(message: string) {
        active();
        require('account.sign');
        return guard(() => keyring.account.signMessage({ message }));
      },
      signer() {
        active();
        require('account.sign');
        return keyring.account;
      },
      derive(path: string) {
        active();
        require('account.sign');
        return keyring.derive(path);
      },
      deriveEd25519(path: string) {
        active();
        require('account.sign');
        return keyring.deriveEd25519(path);
      },
    },

    chat: {
      async startDm(addressOrId) {
        require('chat.send');
        const store = accountChat();
        const session = xmtpSessionFor(store);
        if (!session) throw new Error('Not connected to XMTP yet.');

        const participantId = await session.resolveParticipant(addressOrId);
        active();
        if (!participantId) return null;

        const chat = await store.startDm(PLUGIN_PROTOCOL, participantId);
        active();
        return chat.id;
      },
      async startGroup(addressesOrIds, title) {
        require('chat.send');
        const store = accountChat();
        const session = xmtpSessionFor(store);
        if (!session) throw new Error('Not connected to XMTP yet.');

        const resolved = await Promise.all(
          addressesOrIds.map(async (value) => ({
            value,
            participantId: await session.resolveParticipant(value),
          }))
        );
        active();

        const reachable = resolved
          .filter((r) => r.participantId)
          .map((r) => r.participantId as string);
        const unreachable = resolved.filter((r) => !r.participantId).map((r) => r.value);

        if (reachable.length === 0) {
          throw new Error('None of those addresses can receive messages yet.');
        }

        const chat = await store.startGroup(PLUGIN_PROTOCOL, reachable, title);
        active();
        return { chatId: chat.id, unreachable };
      },
      async send(chatId, content) {
        require('chat.send');
        await guard(() => accountChat().sendMessage(chatId, content));
      },
      async sendText(chatId, text) {
        require('chat.send');
        await guard(() => accountChat().sendMessage(chatId, { kind: 'text', text }));
      },
      async members(chatId) {
        require('chat.read');
        try {
          const roster = await accountChat().getMembers(chatId);
          active();
          return roster.map((member) => member.id);
        } catch {
          active();
          return [];
        }
      },

      async sendCustom(chatId, typeId, data) {
        require('chat.send');
        await guard(() => accountChat().sendMessage(chatId, { kind: 'custom', typeId, data }));
      },
    },

    plugins: {
      list() {
        active();
        require('plugins.manage');
        return registry.list().map((p) => ({
          id: p.manifest.id,
          name: p.manifest.name,
          description: p.manifest.description,
          enabled: registry.isActive(p.manifest.id),
          icon: p.manifest.icon,
        }));
      },
      async setEnabled(id, enabled) {
        active();
        require('plugins.manage');
        await accountRuntime.setPluginEnabled(id, enabled);
        active();
      },
      commands(chatId) {
        active();
        require('plugins.manage');
        const kind = useChatStore.getState().chats.find((c) => c.id === chatId)?.kind;
        const scope = chatScope(chatId, kind);
        const session = sessionFor(useChatStore.getState(), chatId);
        return registry
          .commandListFor(chatId, scope)
          .filter(({ command }) => worksOn(command, session))
          .map(({ command, pluginId }) => ({
            name: command.name,
            description: command.description,
            usage: command.usage,
            pluginId,
          }));
      },
      channelOwner(chatId) {
        active();
        require('plugins.manage');
        return registry.channelOwner(chatId);
      },
    },

    ui: {
      notify(message, tone) {
        active();
        ui.notify(message, tone);
      },
      openChat(chatId) {
        active();
        ui.openChat(chatId);
      },
      openSettings(page) {
        active();
        ui.openSettings(page);
      },
      openProfile(chatId, participantId) {
        active();
        router.push({
          pathname: '/profile/[id]',
          params: participantId ? { id: chatId, member: participantId } : { id: chatId },
        });
      },
      async openExternalUrl(url: string) {
        require('browser.open');
        await guard(() => openExternal(url));
      },
    },
  };
}

export function PluginProvider({ plugins, defaultEnabled, ui, children }: PluginProviderProps) {
  const [registry] = useState(
    () =>
      new PluginRegistry(plugins, {
        commands: [...groupCommands, pollCommand],
        composerActions: groupComposerActions,
      })
  );
  const [enabledIds, setEnabledIds] = useState<PluginId[]>([]);

  const setEnabled = async (id: PluginId, enabled: boolean) => {
    await accountRuntime.setPluginEnabled(id, enabled);
  };

  const handleUri = (url: string) => registry.handleUri(url);

  const value: PluginHostValue = {
    registry,
    enabledIds,
    defaultEnabled: defaultEnabled ?? registry.list().map((plugin) => plugin.manifest.id),
    makeContext: (plugin, accountId, keyring, storage, lease) =>
      makePluginContext(registry, ui, plugin, accountId, keyring, storage, lease),
    onPluginsChanged: setEnabledIds,
    setEnabled,
    handleUri,
  };

  return <PluginHostContext value={value}>{children}</PluginHostContext>;
}
