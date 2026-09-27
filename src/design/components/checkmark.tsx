import { Icon } from '../icon';

export function Checkmark({
  selected,
  multiple = false,
}: {
  selected?: boolean;
  multiple?: boolean;
}) {
  if (multiple) {
    return (
      <Icon
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        tone={selected ? 'brand' : 'subtle'}
      />
    );
  }
  return selected ? <Icon name="checkmark" size={20} tone="brand" /> : null;
}
