import { Icon } from "../icon";

export function Checkmark({ selected, multiple = false }: { selected?: boolean; multiple?: boolean }) {
  if (multiple) {
    return <Icon name={selected ? "circle-check" : "circle"} size={24} tone={selected ? "accent" : "subtle"} />;
  }
  return selected ? <Icon name="check" size={20} tone="accent" /> : null;
}
