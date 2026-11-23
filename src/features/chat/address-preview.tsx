import type { ChatId } from "@/core/messaging/types";

import { PluginPreview } from "./plugin-preview";
import { useOffersSend } from "./use-offers-send";

export function AddressPreview({
  value,
  chatId,
  onCommand,
}: {
  value: string;
  chatId: ChatId;
  onCommand?: (command: string) => void;
}) {
  const canSend = useOffersSend(chatId, onCommand);
  const args = canSend ? [value] : [value, "no-send"];
  return <PluginPreview live={{ pluginId: "wallet", view: "address", args }} once onCommand={onCommand} />;
}
