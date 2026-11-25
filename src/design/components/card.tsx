import { View, type ViewProps } from "react-native";

import { cn } from "../lib/cn";

interface CardProps extends ViewProps {
  className?: string;
}

export function Card({ className, ...props }: CardProps) {
  return (
    <View
      className={cn("rounded-lg border border-line bg-panel p-4", className)}
      style={{ borderCurve: "continuous" }}
      {...props}
    />
  );
}
