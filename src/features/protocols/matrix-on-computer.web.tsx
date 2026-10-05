import { LocalHomeserver } from './local-homeserver';
import type { MatrixOnComputerProps } from './matrix-on-computer';

export function MatrixOnComputer({
  accountId,
  signedOut,
  onBridgesChanged,
}: MatrixOnComputerProps) {
  return (
    <LocalHomeserver
      accountId={accountId}
      signedOut={signedOut}
      onBridgesChanged={onBridgesChanged}
    />
  );
}
