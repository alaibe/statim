import { useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Sheet } from '@/design';
import { useAction } from '@/features/use-action';
import type { AccountRecord } from '@/core/account/accounts';
import { useAccountStore } from '@/core/account/account-store';

export function RenameAccountSheet({
  account,
  onClose,
}: {
  account: AccountRecord | null;
  onClose: () => void;
}) {
  const renameAccount = useAccountStore((s) => s.renameAccount);
  const [draft, setDraft] = useState<string | null>(null);
  const label = draft ?? account?.label ?? '';
  const close = () => {
    setDraft(null);
    onClose();
  };
  const save = useAction(
    async () => {
      if (account) await renameAccount(account.id, label);
      close();
    },
    { failure: 'Could not rename the account' }
  );

  return (
    <Sheet visible={account !== null} onClose={close} title="Rename account">
      <View className="gap-3">
        <Field
          value={label}
          onChangeText={setDraft}
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
          onPress={() => save.run()}
        />
      </View>
    </Sheet>
  );
}
