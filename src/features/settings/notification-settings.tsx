import { Icon, ListItem, Section, Toggle } from '@/design';
import { icloudContainer } from '@/core/icloud/container';
import { listenToComputer, listeningState, stopListening } from '@/core/icloud/phone';

import { useAccountSwitch } from './use-account-switch';

export const notificationsIntro =
  'Statim notifies you while it runs. iOS stops it soon after you leave it, so Statim on your computer can wake this iPhone instead.';

/** Hidden without an iCloud container in the build, since the page's one switch needs it. */
export const notificationsHint = icloudContainer() ? 'From your computer' : null;

export function NotificationSettings() {
  const { state, change } = useAccountSwitch(
    listeningState,
    listenToComputer,
    stopListening,
    'Could not change notifications from your computer'
  );

  if (!state || state === 'unavailable') return null;
  return (
    <Section title="From your computer" surface="card" className="mb-6">
      <ListItem
        testID="from-computer"
        title="Notifications from your computer"
        subtitle="Statim on your computer wakes this iPhone through your iCloud when a message arrives. It needs the same iCloud and this account on the computer. Off by default."
        numberOfLinesSubtitle={4}
        leading={<Icon name="notifications-outline" size={20} tone="muted" />}
        trailing={
          <Toggle
            label="Notifications from your computer"
            value={state === 'on'}
            disabled={change.busy}
            onValueChange={(next) => void change.run(next)}
          />
        }
      />
    </Section>
  );
}
