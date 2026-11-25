import { useState } from "react";
import { View } from "react-native";
import type { ChatId } from "@/core/messaging/types";
import { Button, Text, useThemeColors } from "@/design";
import { BlockSheet } from "./block";
import { answerRequest } from "./requests";

export function RequestBar({ chatId, name, canBlock }: { chatId: ChatId; name: string; canBlock: boolean }) {
  const colors = useThemeColors();
  const [blocking, setBlocking] = useState(false);
  return (
    <View
      className="gap-3 px-4 pb-3 pt-3"
      style={{ borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.bg }}
    >
      <Text size="sm" tone="muted" align="center">
        You have not accepted this request. Declining it takes the chat off your list without blocking the sender.
      </Text>
      <View className="flex-row gap-2">
        {canBlock ? (
          <View className="flex-1">
            <Button
              testID="request-block"
              label="Block…"
              variant="danger"
              fullWidth
              onPress={() => setBlocking(true)}
            />
          </View>
        ) : null}
        <View className="flex-1">
          <Button
            testID="request-decline"
            label="Decline"
            fullWidth
            onPress={() => answerRequest(chatId, "declined")}
          />
        </View>
        <View className="flex-1">
          <Button
            testID="request-accept"
            label="Accept"
            variant="primary"
            fullWidth
            onPress={() => answerRequest(chatId, "accepted")}
          />
        </View>
      </View>
      {blocking ? <BlockSheet chatId={chatId} name={name} onClose={() => setBlocking(false)} /> : null}
    </View>
  );
}
