import { useState } from "react";
import { View } from "react-native";
import type { MessageContent } from "@/core/messaging/types";
import { Button, Checkbox, Pressable, Radio, Radius, Text, useThemeColors } from "@/design";

import { useAction } from "@/features/use-action";

type Poll = Extract<MessageContent, { kind: "poll" }>;

export function PollBubble({
  poll,
  onVote,
}: {
  poll: Poll;
  fromMe: boolean;
  onVote?: (optionIds: number[]) => Promise<void>;
}) {
  const colors = useThemeColors();
  const chosen = poll.options.flatMap((option, index) => (option.chosen ? [index] : []));
  const [selected, setSelected] = useState<number[] | null>(null);
  const currentSelection = selected ?? chosen;
  const vote = useAction(
    async (ids: number[]) => {
      await onVote?.(ids);
      setSelected(null);
    },
    { failure: "Could not vote" },
  );
  const voted = chosen.length > 0;
  const canVote = !!onVote && !poll.closed && !vote.busy;

  const submit = (ids: number[]) => {
    if (canVote) void vote.run(ids);
  };

  return (
    <View className="gap-2 py-1" style={{ minWidth: 208 }}>
      <Text strong>{poll.question}</Text>
      <Text variant="label">{poll.multiple ? "Choose one or more" : "Choose one"}</Text>
      {poll.options.map((option, index) => {
        const active = currentSelection.includes(index);
        const disabled = !canVote || (!poll.multiple && option.chosen);
        return (
          <Pressable
            key={index}
            accessibilityRole={poll.multiple ? "checkbox" : "radio"}
            accessibilityState={{ checked: active, disabled }}
            accessibilityLabel={`${option.text}${option.chosen ? ", selected" : ""}`}
            disabled={disabled}
            onPress={() =>
              poll.multiple
                ? setSelected((current) => {
                    const ids = current ?? chosen;
                    return ids.includes(index) ? ids.filter((id) => id !== index) : [...ids, index];
                  })
                : submit([index])
            }
            className="min-h-10 flex-row items-center gap-2 px-2 py-1.5"
            style={({ hovered }) => ({
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: hovered && !disabled ? colors.hover : "transparent",
            })}
          >
            {poll.multiple ? <Checkbox checked={active} /> : <Radio checked={active} />}
            <Text className="min-w-0 flex-1">{option.text}</Text>
            {voted || poll.closed ? <Text variant="meta">{option.percentage}%</Text> : null}
          </Pressable>
        );
      })}
      {poll.multiple &&
      canVote &&
      selected &&
      selected.length > 0 &&
      (selected.length !== chosen.length || selected.some((id) => !chosen.includes(id))) ? (
        <Button label="Vote" size="sm" onPress={() => submit(selected)} />
      ) : null}
      <Text variant="meta">
        {poll.totalVoters} {poll.totalVoters === 1 ? "vote" : "votes"}
        {poll.closed ? " · Closed" : ""}
      </Text>
    </View>
  );
}
