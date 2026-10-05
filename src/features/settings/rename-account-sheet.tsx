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
  account: AccountRecord;
  onClose: () => void;
}) {
  const renameAccount = useAccountStore((s) => s.renameAccount);
  const [label, setLabel] = useState(account.label);
  const save = useAction(
    async () => {
      await renameAccount(account.id, label);
      onClose();
    },
    { failure: 'Could not rename the account' }
  );

  return (
    <Sheet visible onClose={onClose} title="Rename account">
      <View className="gap-3">
        <Field
          value={label}
          onChangeText={setLabel}
          autoFocus
          placeholder="Personal"
          maxLength={40}
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
