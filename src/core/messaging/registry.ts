import type { LocalAccount } from 'viem';

import type { DerivedKey } from '../account/keyring';
import {
  missingFields,
  withDefaults,
  type ProtocolConfig,
  type ProtocolConfigSchema,
} from './config';
import type { ProtocolId } from './namespace';
import type {
  ChatProtocolMeta,
  ChatSession,
  CustomContentType,
  XmtpInstallation,
} from './protocol';
import type { AccountStorage } from '@/storage/account';

export interface PublicChatsCopy {
  title: string;
  hint: string;
  placeholder: string;
}

interface ProtocolConnectParams {
  accountId: string;
  account: LocalAccount;
  derive(path: string): DerivedKey;
  contentTypes: CustomContentType[];
  config: ProtocolConfig;
  storage: AccountStorage;
}

interface ProtocolInstallationParams {
  account: LocalAccount;
  config: ProtocolConfig;
}

interface ProtocolEraseParams {
  accountId: string;
  address: `0x${string}`;
  config: ProtocolConfig;
}

/** How the new-chat screen asks for, and fails to find, someone on this protocol. */
interface AddressCopy {
  label: string;
  placeholder: string;
  /** With its article, for prose: "Paste an address below". */
  noun: string;
  hint: string;
  unreachable(input: string): string;
}

export interface ProtocolDescriptor {
  id: ProtocolId;
  label: string;
  meta: ChatProtocolMeta;
  description: string;
  docsUrl?: string;
  /** Its chats sit in a folder of their own rather than at the top of the chat list. */
  folded: boolean;
  address: AddressCopy;
  publicChats?: PublicChatsCopy;
  configSchema: ProtocolConfigSchema;
  /** Reads plugin content types when it connects, so a plugin change reconnects it. */
  usesPluginContentTypes?: boolean;
  connect?(params: ProtocolConnectParams): Promise<ChatSession>;
  eraseLocalData?(params: ProtocolEraseParams): Promise<void>;
  /**
   * The account's installations, read and revoked without a session, as when the installation
   * limit keeps one from connecting.
   */
  installations?: {
    list(params: ProtocolInstallationParams): Promise<XmtpInstallation[]>;
    revoke(params: ProtocolInstallationParams, ids: string[]): Promise<void>;
  };
}

export function connectableProtocols(
  protocols: readonly ProtocolDescriptor[]
): ProtocolDescriptor[] {
  return protocols.filter((protocol) => protocol.connect);
}

export function isConfigured(descriptor: ProtocolDescriptor, config: ProtocolConfig): boolean {
  return Boolean(descriptor.connect) && missingFields(descriptor.configSchema, config).length === 0;
}

export function effectiveConfig(
  descriptor: ProtocolDescriptor,
  config: ProtocolConfig
): ProtocolConfig {
  return withDefaults(descriptor.configSchema, config);
}
