import { useState } from 'react';

import { Button, Card, QrScanner, Text } from '@/design';
import { errorMessage } from '@/core/errors';
import { DEVICE_NAME } from '@/protocols/matrix/descriptor';

import { adoptMatrixSession } from './matrix-session';
import { readPhoneLink, signInWithLink } from './phone-link';

/** The phone's way onto the Matrix server Statim runs on the person's computer. */
export function ScanFromComputer({ accountId }: { accountId: string }) {
  const [scanning, setScanning] = useState(false);

  const signIn = async (data: string) => {
    const link = readPhoneLink(data);
    if (!link) return 'That is not a code from Statim on your computer.';
    try {
      await adoptMatrixSession(accountId, await signInWithLink(link, DEVICE_NAME));
    } catch (e) {
      return errorMessage(e, 'Could not sign in with that code');
    }
    setScanning(false);
    return null;
  };

  return (
    <Card className="gap-2">
      <Text variant="headline">Matrix on your computer</Text>
      <Text variant="caption">
        If Statim runs Matrix on your computer, choose Connect your phone there, under Settings ›
        Matrix, and scan the code it shows. Both devices need Tailscale.
      </Text>
      <Button
        testID="matrix-scan-computer"
        label="Scan the code from your computer"
        tone="neutral"
        size="md"
        fullWidth
        onPress={() => setScanning(true)}
      />
      {scanning ? (
        <QrScanner
          title="Scan your computer's code"
          purpose="Point the camera at the code Statim shows on your computer. It is used for that and nothing else, and no image leaves this device."
          hint="On the computer: Settings › Matrix › Connect your phone."
          onScanned={signIn}
          onClose={() => setScanning(false)}
        />
      ) : null}
    </Card>
  );
}
