import type { Capability } from '../messaging/capability';
import type { ComponentType, ReactNode } from 'react';
import type { Address, Hex, LocalAccount } from 'viem';

import type { DerivedKey } from '../account/keyring';
import type { Ed25519Key } from '../account/slip10';
import type { AccountCapabilities } from '../account/account-kind';

import type { IconName } from '@/design';
import type { Guard } from '@/lib/guards';
import type { ChatScope } from '../messaging/chat-scope';

import type { Bot } from '../messaging/bots';
import type {
  ChatMessage,
  ChatId,
  MessageContent,
  ParticipantId,
  WidgetContent,
} from '../messaging/types';

export type { Bot, BotContext, BotDisposer } from '../messaging/bots';
export { poll } from '../messaging/bots';

export type PluginId = string;

export type PluginPermission =
  | 'account.read'
  | 'account.sign'
  | 'chat.read'
  | 'chat.send'
  | 'network'
  | 'storage'
  | 'browser.open'
  | 'plugins.manage';

export const PERMISSION_LABELS: Record<PluginPermission, string> = {
  'account.read': 'See your address and participant id',
  'account.sign': 'Ask you to sign messages and transactions',
  'chat.read': 'Read messages in your chats',
  'chat.send': 'Send messages on your behalf',
  network: 'Make network requests',
  storage: 'Store data on this device',
  'browser.open': 'Open links in your browser',
  'plugins.manage': 'Turn other plugins on and off',
};

export interface PluginManifest {
  id: PluginId;
  name: string;
  description: string;
  version: string;
  icon: IconName;
  permissions: PluginPermission[];
  requiresSessionRestart?: boolean;
}

export interface PluginStorage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface PluginAccountApi {
  accountId: string | null;
  capabilities: AccountCapabilities;
  address: Address;
  participantId: string;
  signMessage(message: string): Promise<Hex>;
  signer(): LocalAccount;
  derive(path: string): DerivedKey;
  deriveEd25519(path: string): Ed25519Key;
}

export interface PluginChatApi {
  startDm(addressOrId: string): Promise<ChatId | null>;
  startGroup(
    addressesOrIds: string[],
    title: string
  ): Promise<{ chatId: ChatId; unreachable: string[] }>;
  send(chatId: ChatId, content: MessageContent): Promise<void>;
  sendText(chatId: ChatId, text: string): Promise<void>;
  sendCustom(chatId: ChatId, typeId: string, data: unknown): Promise<void>;
  members(chatId: ChatId): Promise<ParticipantId[]>;
}

export interface PluginUiApi {
  notify(message: string, tone?: 'info' | 'success' | 'error'): void;
  /**
   * Hands the URL to the system browser. An in-app browser would lose the page
   * the moment the user came back here to approve a WalletConnect request.
   */
  openExternalUrl(url: string): Promise<void>;
  openChat(chatId: ChatId): void;
  openProfile(chatId: ChatId, participantId?: ParticipantId): void;
  openSettings(page: SettingsLink): void;
}

/** The parts of Settings a plugin can send the user to: its Security section, or setting a PIN. */
export type SettingsLink = 'security' | 'pin';

export interface PluginSummary {
  id: PluginId;
  name: string;
  description: string;
  enabled: boolean;
  icon?: IconName;
}

export interface PluginManagementApi {
  list(): PluginSummary[];
  setEnabled(id: PluginId, enabled: boolean): Promise<void>;
  commands(
    chatId: ChatId
  ): { name: string; description: string; usage: string; pluginId: PluginId }[];
  channelOwner(chatId: ChatId): PluginId | undefined;
}

export interface PluginContext {
  manifest: PluginManifest;
  storage: PluginStorage;
  account: PluginAccountApi;
  chat: PluginChatApi;
  ui: PluginUiApi;
  plugins: PluginManagementApi;
}

export interface PluginLease {
  assertActive(): void;
  guard<T>(run: () => Promise<T>): Promise<T>;
}

export interface CommandInvocation {
  rest: string;
  respond(content: MessageContent | string): Promise<void>;
  args: string[];
  chatId: ChatId;
  context: PluginContext;
}

export type CommandResult =
  | { type: 'handled' }
  | { type: 'setComposer'; text: string }
  | { type: 'notice'; message: string; tone?: 'info' | 'success' }
  | { type: 'error'; message: string };

export interface SlashCommand {
  name: string;
  /** Offered only in chats whose protocol can do this. */
  requires?: Capability;
  /** Posts a plugin content type, which only some protocols carry. */
  sendsCustom?: boolean;
  aliases?: string[];
  description: string;
  usage: string;
  global?: boolean;
  showIn?: readonly ChatScope[];
  hidden?: boolean;
  run(invocation: CommandInvocation): Promise<CommandResult>;
}

export interface MessageRendererProps<T = unknown> {
  data: T;
  message: ChatMessage;
  fromMe: boolean;
  context: PluginContext;
  onCommand?: (command: string) => void;
}

export interface PluginContentType<T = unknown> {
  typeId: string;
  /** False when a participant sent something this plugin cannot read. */
  is: Guard<T>;
  fallback(data: T): string;
  render(props: MessageRendererProps<T>): ReactNode;
}

export function contentType<T>(spec: PluginContentType<T>): PluginContentType {
  return spec;
}

export interface ComposerAction {
  id: string;
  label: string;
  icon: IconName;
  command: string;
  showIn?: readonly ChatScope[];
  global?: boolean;
}

export interface PluginOverlay {
  id: string;
  component: ComponentType;
}

export interface UriHandler {
  schemes: string[];
  handle(url: string, context: PluginContext): Promise<boolean>;
}

export type PluginView = (args?: readonly string[]) => Promise<WidgetContent>;

/** A card under someone else's text message, drawn by `view`, in place of the app's own link and address cards. */
export interface TextPreview {
  view: string;
  /** The view's args when the text is one this plugin recognises. */
  match(text: string): string[] | null;
}

export interface PluginContribution {
  commands?: SlashCommand[];
  views?: Record<string, PluginView>;
  bots?: Bot[];
  contentTypes?: PluginContentType[];
  composerActions?: ComposerAction[];
  textPreviews?: TextPreview[];
  overlays?: PluginOverlay[];
  uriHandlers?: UriHandler[];
  /** Names you gave participants, such as bots you added. They win over names from the protocol. */
  names?(): Promise<Record<ParticipantId, string>>;
  start?(): Promise<(() => void) | void>;
}

export interface Plugin {
  manifest: PluginManifest;
  setup(context: PluginContext): PluginContribution;
}

export interface ActivePlugin {
  plugin: Plugin;
  contribution: PluginContribution;
  context: PluginContext;
  revoke?: () => void;
  dispose?: () => void;
}
