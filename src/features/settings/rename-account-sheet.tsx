import { useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Sheet } from '@/design';
import type { AccountRecord } from '@/core/identity/accounts';
import { useIdentityStore } from '@/core/identity/identity-store';

export function RenameAccountSheet({
  account,
  onClose,
}: {
  account: AccountRecord | null;
  onClose: () => void;
}) {
  const renameAccount = useIdentityStore((s) => s.renameAccount);
  const [draft, setDraft] = useState<{ id: string; label: string } | null>(null);
  const label = draft && draft.id === account?.id ? draft.label : (account?.label ?? '');

  return (
    <Sheet visible={account !== null} onClose={onClose} title="Rename account">
      <View className="gap-3">
        <Field
          key={account?.id}
          defaultValue={account?.label}
          onChangeText={(text) => account && setDraft({ id: account.id, label: text })}
          autoFocus
          placeholder="Personal"
          maxLength={40}
          // The same distinction the create screen draws. Without it the
          // field looks like it sets what other people see, and it is the
          // one name that never leaves the device.
          hint="Just for you, on this device. An ENS name is the one other people see."
        />
        <Button
          label="Save"
          fullWidth
          disabled={label.trim().length === 0}
          onPress={async () => {
            if (account) await renameAccount(account.id, label);
            onClose();
          }}
        />
      </View>
    </Sheet>
  );
}
