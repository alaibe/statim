import { Button, Card, copyText, Text } from '@/design';

export function OwnAddress({ label, address }: { label: string; address: string }) {
  return (
    <Card className="gap-2" testID="protocol-own-address">
      <Text variant="footnote" className="font-semibold">
        Your {label} address
      </Text>
      <Text variant="caption" selectable>
        {address}
      </Text>
      <Button
        label="Copy"
        tone="neutral"
        size="sm"
        onPress={() => copyText(address, 'Address copied')}
      />
    </Card>
  );
}
