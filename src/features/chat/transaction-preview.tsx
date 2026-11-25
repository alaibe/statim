import { View } from "react-native";
import { shortAddress } from "@/core/account/keyring";
import { Pressable, Radius, Tag, Text, useThemeColors } from "@/design";
import { SUPPORTED_CHAINS } from "@/lib/evm/chains";
import { locateTransaction } from "@/lib/evm/transactions";
import { useKeyedLoad } from "@/lib/use-keyed-load";
import { openUrlQuietly } from "./link-actions";

const STATUS = {
  success: { tone: "ok", label: "Confirmed" },
  reverted: { tone: "err", label: "Reverted" },
  pending: { tone: "warn", label: "Pending" },
} as const;

export function TransactionPreview({ hash }: { hash: `0x${string}`; fromMe: boolean }) {
  const colors = useThemeColors();
  const summary = useKeyedLoad(hash, locate).value;

  if (!summary) return null;

  const status = STATUS[summary.status === "success" || summary.status === "reverted" ? summary.status : "pending"];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Transaction on ${summary.chainName}, ${status.label}`}
      onPress={() => {
        if (summary.explorerUrl) openUrlQuietly(summary.explorerUrl);
      }}
      className="mt-1.5 gap-1 p-2"
      style={({ hovered }) => ({
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: hovered ? colors.hover : "transparent",
      })}
    >
      <View className="flex-row items-center gap-1.5">
        <Tag tone={status.tone} />
        <Text variant="meta">
          {status.label} · {summary.chainName}
        </Text>
      </View>

      <Text variant="code" strong>
        {summary.amount ?? "Contract call"}
      </Text>

      <Text variant="meta" numberOfLines={1}>
        {shortAddress(summary.from)} → {summary.to ? shortAddress(summary.to) : "contract creation"}
      </Text>
    </Pressable>
  );
}

function locate(hash: `0x${string}`) {
  return locateTransaction(
    hash,
    SUPPORTED_CHAINS.map((chain) => chain.id),
  );
}
