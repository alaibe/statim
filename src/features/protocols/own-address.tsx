import { Button, Card, copyText, Text } from '@/design';

export function OwnAddress({
  label,
  address,
  inboxId,
}: {
  label: string;
  address: string;
  inboxId?: string;
}) {
  return (
    <Card className="gap-2" testID="protocol-own-address">
      <Text variant="footnote" className="font-semibold">
        Your {label} address
      </Text>
      <Text variant="caption" selectable>
        {address}
      </Text>
      <Button
        label="Copy address"
        tone="neutral"
        size="sm"
        onPress={() => copyText(address, 'Address copied')}
      />
      {inboxId ? (
        <>
          <Text variant="footnote" className="mt-2 font-semibold">
            Inbox id
          </Text>
          <Text variant="caption" selectable>
            {inboxId}
          </Text>
          <Button
            label="Copy inbox id"
            tone="neutral"
            size="sm"
            onPress={() => copyText(inboxId, 'Inbox id copied')}
          />
        </>
      ) : null}
    </Card>
  );
}
