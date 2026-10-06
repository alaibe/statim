import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
  ActionSheet,
  Avatar,
  Button,
  Checkmark,
  ConfirmSheet,
  ListItem,
  Note,
  Section,
  SwipeableRow,
  Text,
} from '@/design';
import { eraseAccount } from '@/core/app/erase-account';
import { useAccountStore } from '@/core/account/account-store';
import { shortAddress } from '@/core/account/keyring';
import { describeKind } from '@/core/account/account-kind';
import type { AccountRecord } from '@/core/account/accounts';
import { hardwareVendors } from '@/core/account/hardware';
import { ConnectHardware } from '@/features/account/connect-hardware';
import { useAction } from '@/features/use-action';
import { RenameAccountSheet } from '@/features/settings/rename-account-sheet';
import { SettingsScreen } from '@/features/settings/settings-screen';

export default function AccountsScreen() {
  const router = useRouter();

  const accounts = useAccountStore((s) => s.accounts);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const selectAccount = useAccountStore((s) => s.selectAccount);
  const needsChatKeys = useAccountStore((s) => s.keyring !== null && s.keyring.chatKey === null);
  const setUpChatKeys = useAction(useAccountStore.getState().setUpChatKeys, {
    failure: 'Could not set up chat keys',
  });

  const [managing, setManaging] = useState<AccountRecord | null>(null);
  const [renaming, setRenaming] = useState<AccountRecord | null>(null);
  const [confirmWipe, setConfirmWipe] = useState<AccountRecord | null>(null);
  const erase = useAction(eraseAccount, { failure: 'Could not erase that account' });
  const open = useAction(
    async (id: string) => {
      await selectAccount(id);
      router.replace('/chats');
    },
    { failure: 'Could not open that account' }
  );
  const [connecting, setConnecting] = useState(false);

  return (
    <SettingsScreen
      title="Accounts"
      intro="Each account has its own keys, its own message database and its own plugin settings. Nothing is shared between them. Tap one to switch to it, hold to rename or erase it.">
      <Section surface="card" className="mb-6">
        {accounts.map((account) => (
          <SwipeableRow
            key={account.id}
            right={[
              {
                id: 'erase',
                label: 'Erase',
                icon: 'trash-outline',
                destructive: true,
                onPress: () => setConfirmWipe(account),
              },
            ]}>
            <ListItem
              key={account.id}
              testID={`account-${account.id}`}
              title={account.label}
              subtitle={
                account.kind === 'hardware'
                  ? `${shortAddress(account.address, 8, 6)} · ${describeKind('hardware')}`
                  : shortAddress(account.address, 10, 8)
              }
              numberOfLinesSubtitle={2}
              leading={<Avatar seed={account.address} size="md" />}
              // Only state on the right: tapping switches, holding manages, swiping erases.
              trailing={<Checkmark selected={account.id === activeAccountId} />}
              onLongPress={() => setManaging(account)}
              onContextMenu={() => setManaging(account)}
              onPress={async () => {
                if (account.id === activeAccountId) setManaging(account);
                else await open.run(account.id);
              }}
            />
          </SwipeableRow>
        ))}
      </Section>

      {needsChatKeys ? (
        <View className="mb-6 gap-2 px-gutter">
          <Note icon="key-outline">
            <Text variant="footnote">
              Nostr, Status and notifications from your computer need chat keys for this account.
              Your wallet makes them by signing one message, which moves no funds.
            </Text>
          </Note>
          <Button
            testID="set-up-chat-keys"
            label="Set up chat keys"
            fullWidth
            loading={setUpChatKeys.busy}
            onPress={() => void setUpChatKeys.run()}
          />
        </View>
      ) : null}

      <View className="gap-2 px-gutter">
        <Button
          label="Create a new account"
          fullWidth
          onPress={() => router.push('/(onboarding)/create')}
        />
        <Button
          label="Import a recovery phrase"
          tone="neutral"
          fullWidth
          onPress={() => router.push('/(onboarding)/import')}
        />
        {hardwareVendors().length > 0 ? (
          <Button
            testID="connect-hardware"
            label="Connect a hardware wallet"
            tone="neutral"
            fullWidth
            onPress={() => setConnecting(true)}
          />
        ) : null}
      </View>

      <ConnectHardware visible={connecting} onClose={() => setConnecting(false)} />

      {managing ? (
        <ActionSheet
          visible
          onClose={() => setManaging(null)}
          title={managing.label}
          actions={[
            {
              label: 'Rename',
              icon: 'create-outline',
              onPress: () => setRenaming(managing),
            },
            {
              label: 'Erase this account',
              icon: 'trash-outline',
              tone: 'danger',
              onPress: () => setConfirmWipe(managing),
            },
          ]}
        />
      ) : null}

      {renaming ? (
        <RenameAccountSheet account={renaming} onClose={() => setRenaming(null)} />
      ) : null}

      {confirmWipe ? (
        <ConfirmSheet
          visible
          onClose={() => setConfirmWipe(null)}
          title="Erase this account?"
          body={`This deletes ${confirmWipe.label}'s keys, messages and plugin data from this device. Nobody else holds them, so without its recovery phrase written down the account cannot be recovered. Your other accounts are untouched.`}
          confirm={{
            label: 'Erase account',
            busyLabel: 'Erasing…',
            tone: 'danger',
            onPress: async () => {
              const next = accounts.length === 1 ? '/(onboarding)/welcome' : '/chats';
              if (!(await erase.run(confirmWipe.id))) return;
              setConfirmWipe(null);
              router.replace(next);
            },
          }}
        />
      ) : null}
    </SettingsScreen>
  );
}
