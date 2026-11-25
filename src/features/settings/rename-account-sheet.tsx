import { useState } from "react";
import { View } from "react-native";
import { useAccountStore } from "@/core/account/account-store";
import type { AccountRecord } from "@/core/account/accounts";
import { Button, Input, Sheet } from "@/design";
import { useAction } from "@/features/use-action";

export function RenameAccountSheet({ account, onClose }: { account: AccountRecord; onClose: () => void }) {
  const renameAccount = useAccountStore((s) => s.renameAccount);
  const [label, setLabel] = useState(account.label);
  const save = useAction(
    async () => {
      await renameAccount(account.id, label);
      onClose();
    },
    { failure: "Couldn't rename the account" },
  );

  return (
    <Sheet visible onClose={onClose} title="Rename account">
      <View className="gap-4">
        <Input
          label="Name"
          value={label}
          onChangeText={setLabel}
          autoFocus
          placeholder="Personal"
          maxLength={40}
          help="Just for you, on this device. An ENS name is the one other people see."
        />
        <View className="flex-row justify-end gap-2">
          <Button label="Cancel" onPress={onClose} />
          <Button
            variant="primary"
            label="Rename"
            keys={["mod", "enter"]}
            busy={save.busy}
            disabled={label.trim().length === 0}
            onPress={() => save.run()}
          />
        </View>
      </View>
    </Sheet>
  );
}
