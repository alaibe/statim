import { View } from 'react-native';

import { cn } from '../lib/cn';
import { IconButton } from './icon-button';
import { Text } from './text';

export interface ModalHeaderProps {
  title: string;
  onClose: () => void;
  closeLabel?: string;
  action?: React.ReactNode;
  className?: string;
}

export function ModalHeader({
  title,
  onClose,
  closeLabel = 'Close',
  action,
  className,
}: ModalHeaderProps) {
  return (
    <View className={cn('flex-row items-center py-3', className)}>
      <View className="flex-1 items-start">
        <IconButton icon="close" label={closeLabel} surface="sunken" size={18} onPress={onClose} />
      </View>
      <Text numberOfLines={1} className="shrink text-center font-semibold">
        {title}
      </Text>
      <View className="flex-1 items-end">{action}</View>
    </View>
  );
}
