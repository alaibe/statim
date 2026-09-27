import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Avatar, Badge, IconButton, Text } from '@/design';
import { reportError } from '@/core/app/report-error';
import { activeAccount, useAccountStore } from '@/core/account/account-store';
import { shortAddress } from '@/core/account/keyring';
import { useChatStore } from '@/core/messaging/chat-store';
import { cachedEnsName, lookupName } from '@/lib/evm/ens';
import { forgetEns } from '@/lib/evm/ens-cache';
import { openInBrowser } from '@/lib/open-url';
import { useKeyedLoad } from '@/lib/use-keyed-load';

/** Looked up again whenever `revision` changes; the ENS button forgets the kept name, so one claimed there shows on the way back. */
export function useEnsName(revision: unknown): string | null {
  const address = useAccountStore((s) => s.keyring?.address);
  const loaded = useKeyedLoad(address ?? null, lookupName, revision);
  if (!address) return null;
  return loaded.value !== undefined ? loaded.value : (cachedEnsName(address) ?? null);
}

/** The account at the top of Settings: who you are, and whether you are connected. */
export function SettingsAccount({ ensName }: { ensName: string | null }) {
  const router = useRouter();
  const keyring = useAccountStore((s) => s.keyring);
  const account = useAccountStore(activeAccount);
  const chatStatus = useChatStore((s) => s.status);

  if (!account) return null;

  return (
    <View className="items-center gap-2 px-gutter pb-6 pt-2">
      <View className="w-full flex-row items-center justify-between">
        <IconButton
          testID="settings-qr"
          icon="qr-code-outline"
          label="My QR code"
          onPress={() => router.push('/qr')}
        />
        {/*
          Opens ENS in the browser, the only place the name other people
          see can be changed: an ENS reverse record is an on-chain claim
          this app reads and does not write. The label under the avatar,
          which is only yours, is edited in Accounts.
        */}
        <IconButton
          testID="settings-ens"
          icon={ensName ? 'create-outline' : 'add-circle-outline'}
          label={ensName ? `Edit ${ensName} on ENS` : 'Get an ENS name'}
          onPress={() => {
            if (keyring) forgetEns(keyring.address);
            openInBrowser('https://app.ens.domains', { fullScreen: true }).catch(reportError);
          }}
        />
      </View>

      <Avatar seed={keyring?.address ?? 'anon'} size="xl" />

      <View className="items-center gap-0.5">
        <Text variant="title" className="font-semibold">
          {ensName ?? account.label}
        </Text>
        <Text variant="mono" selectable>
          {keyring ? shortAddress(keyring.address, 10, 8) : '—'}
        </Text>
      </View>

      <Badge
        label={chatStatus === 'ready' ? 'Connected' : chatStatus}
        tone={chatStatus === 'ready' ? 'success' : chatStatus === 'error' ? 'danger' : 'neutral'}
      />
    </View>
  );
}
