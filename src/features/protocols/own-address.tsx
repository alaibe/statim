import { View } from "react-native";

import { Button, copyText, Text } from "@/design";

export function OwnAddress({ label, address, inboxId }: { label: string; address: string; inboxId?: string }) {
  return (
    <View className="gap-4" testID="protocol-own-address">
      <View className="gap-2">
        <Text variant="label">{`Your ${label} address`}</Text>
        <Text variant="code" selectable>
          {address}
        </Text>
        <Button icon="copy" label="Copy address" size="sm" onPress={() => copyText(address, "Copied the address")} />
      </View>
      {inboxId ? (
        <View className="gap-2">
          <Text variant="label">Inbox ID</Text>
          <Text variant="code" selectable>
            {inboxId}
          </Text>
          <Button
            icon="copy"
            label="Copy inbox ID"
            size="sm"
            onPress={() => copyText(inboxId, "Copied the inbox ID")}
          />
        </View>
      ) : null}
    </View>
  );
}
