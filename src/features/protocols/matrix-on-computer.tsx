import { useState } from "react";
import { View } from "react-native";
import { errorMessage } from "@/core/errors";
import { Button, QrScanner, Text } from "@/design";
import { DEVICE_NAME } from "@/protocols/matrix/descriptor";
import { loginWithToken } from "@/protocols/matrix/token-login";

import { adoptMatrixSession } from "./matrix-session";
import { readPhoneLink } from "./phone-link";

export interface MatrixOnComputerProps {
  accountId: string;
  signedIn: boolean;
  signedOut: boolean;
  onBridgesChanged(): void;
}

export function MatrixOnComputer({ accountId, signedIn }: MatrixOnComputerProps) {
  const [scanning, setScanning] = useState(false);

  const signIn = async (data: string) => {
    const link = readPhoneLink(data);
    if (!link) return "That isn't a code from Statim on your computer.";
    try {
      await adoptMatrixSession(accountId, await loginWithToken(link.homeserver, link.loginToken, DEVICE_NAME));
    } catch (e) {
      return errorMessage(e, "Couldn't sign in with that code");
    }
    setScanning(false);
    return null;
  };

  if (signedIn) return null;
  return (
    <View className="gap-2">
      <Text variant="heading">Matrix on your computer</Text>
      <Text size="sm" tone="muted">
        If Statim runs Matrix on your computer, choose Connect your phone there, under Settings › Matrix, and scan the
        code it shows. Both devices need Tailscale.
      </Text>
      <Button
        testID="matrix-scan-computer"
        icon="qr-code"
        label="Scan the code from your computer"
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
    </View>
  );
}
