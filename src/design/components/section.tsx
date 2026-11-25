import { Children } from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";
import { Eyebrow } from "./eyebrow";
import { Text } from "./text";

interface SectionProps extends ViewProps {
  title?: string;
  surface?: "plain" | "list" | "card";
  inset?: boolean;
  empty?: string;
  className?: string;
}

export function Section({
  title,
  surface = "plain",
  inset = true,
  empty,
  className,
  children,
  ...props
}: SectionProps) {
  const card = surface === "card";

  return (
    <View className={className} {...props}>
      {title ? <Eyebrow className={cn("mb-1.5", card ? inset && "px-7" : "px-4")}>{title}</Eyebrow> : null}
      <View
        style={card ? { borderCurve: "continuous" } : undefined}
        className={cn(
          surface === "list" && "border-y border-line bg-panel",
          card && "overflow-hidden rounded-lg bg-panel",
          card && inset && "mx-4",
        )}
      >
        {empty && Children.toArray(children).length === 0 ? (
          <Text variant="footnote" className="px-4 py-6">
            {empty}
          </Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}
