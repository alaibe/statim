import { View } from "react-native";

import { DialogHeader, desktop, IconButton, PhoneHeader } from "@/design";

/** A route shown as a sheet on a phone and as a dialog on the desktop: its title and the way out. */
export function RouteHeader({
  title,
  label,
  onClose,
  back = false,
}: {
  title: string;
  /** What the dialog is about, above its title on the desktop. */
  label?: string;
  onClose: () => void;
  /** A pushed page goes back; a sheet closes. */
  back?: boolean;
}) {
  if (desktop) {
    return (
      <View className="flex-row items-start">
        <View className="flex-1">
          <DialogHeader label={label} title={title} />
        </View>
        <View className="p-3">
          <IconButton icon="x" label="Close" size="sm" keys={["esc"]} onPress={onClose} />
        </View>
      </View>
    );
  }
  return back ? (
    <PhoneHeader title={title} onBack={onClose} />
  ) : (
    <PhoneHeader title={title} inset={false} action={<IconButton icon="x" label="Close" onPress={onClose} />} />
  );
}
