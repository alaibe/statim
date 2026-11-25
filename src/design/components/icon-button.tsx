import { Icon, type IconName, type IconTone } from "../icon";
import { cn } from "../lib/cn";
import { Pressable, type PressScaleProps } from "./pressable";

const SURFACE = {
  plain: "",
  sunken: "bg-side",
  outline: "border border-line bg-panel",
  accent: "bg-accent",
} as const;

interface IconButtonProps extends Omit<PressScaleProps, "children"> {
  icon: IconName;
  label: string;
  tone?: IconTone;
  surface?: keyof typeof SURFACE;
  size?: number;
}

export function IconButton({ icon, label, surface = "plain", tone, size = 22, className, ...props }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn("size-touch items-center justify-center rounded-full", SURFACE[surface], className)}
      {...props}
    >
      <Icon name={icon} size={size} tone={tone ?? (surface === "accent" ? "on-accent" : "muted")} />
    </Pressable>
  );
}
