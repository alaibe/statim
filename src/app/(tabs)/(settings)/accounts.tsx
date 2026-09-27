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
  Section,
  SwipeableRow,
  toast,
} from '@/design';
import { eraseAccount } from '@/core/app/erase-account';
import { errorMessage } from '@/core/errors';
import { useIdentityStore } from '@/core/identity/identity-store';
import { shortAddress } from '@/core/identity/keyring';
import { describeKind } from '@/core/identity/account-kind';
import { hardwareVendors } from '@/core/identity/hardware';
import { ConnectHardware } from '@/features/identity/connect-hardware';
import { useAction } from '@/core/app/use-action';
import { RenameAccountSheet } from '@/features/settings/rename-account-sheet';
import { SettingsScreen } from '@/features/settings/settings-screen';

export default function AccountsScreen() {
  const router = useRouter();

  const accounts = useIdentityStore((s) => s.accounts);
  const activeAccountId = useIdentityStore((s) => s.activeAccountId);
  const selectAccount = useIdentityStore((s) => s.selectAccount);

  const [managing, setManaging] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState<string | null>(null);
  const erase = useAction(eraseAccount, { failure: 'Could not erase that account' });
  const [connecting, setConnecting] = useState(false);

  const target = accounts.find((a) => a.id === (managing ?? renaming ?? confirmWipe));

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
                onPress: () => setConfirmWipe(account.id),
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
              onLongPress={() => setManaging(account.id)}
              onContextMenu={() => setManaging(account.id)}
              onPress={async () => {
                if (account.id === activeAccountId) {
                  setManaging(account.id);
                  return;
                }
                try {
                  await selectAccount(account.id);
                  router.replace('/chats');
                } catch (error) {
                  toast.error(errorMessage(error, 'Could not open that account'));
                }
              }}
            />
          </SwipeableRow>
        ))}
      </Section>

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

      <ActionSheet
        visible={managing !== null}
        onClose={() => setManaging(null)}
        title={target?.label}
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

      <RenameAccountSheet
        account={accounts.find((a) => a.id === renaming) ?? null}
        onClose={() => setRenaming(null)}
      />

      <ConfirmSheet
        visible={confirmWipe !== null}
        onClose={() => setConfirmWipe(null)}
        title="Erase this account?"
        body={`This deletes ${target?.label}'s keys, messages and plugin data from this device. Nobody else holds them, so without its recovery phrase written down the account cannot be recovered. Your other accounts are untouched.`}
        busy={erase.busy}
        confirm={{
          label: 'Erase account',
          busyLabel: 'Erasing…',
          tone: 'danger',
          onPress: async () => {
            if (!confirmWipe) return;
            const next = accounts.length === 1 ? '/(onboarding)/welcome' : '/chats';
            if (!(await erase.run(confirmWipe))) return;
            setConfirmWipe(null);
            router.replace(next);
          },
        }}
      />
    </SettingsScreen>
  );
}
