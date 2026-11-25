import { useEffect, useState } from "react";
import { View } from "react-native";

import { useAppearanceStore } from "@/core/app/appearance";
import { usage } from "@/core/usage/usage";
import { SECTION_GAP, Section, SettingsRow } from "@/design";
import { SettingsScreen } from "@/features/settings/settings-screen";

export default function PrivacyScreen() {
  const readReceipts = useAppearanceStore((s) => s.readReceipts);
  const setReadReceipts = useAppearanceStore((s) => s.setReadReceipts);
  const typingIndicators = useAppearanceStore((s) => s.typingIndicators);
  const setTypingIndicators = useAppearanceStore((s) => s.setTypingIndicators);
  const linkPreviews = useAppearanceStore((s) => s.linkPreviews);
  const setLinkPreviews = useAppearanceStore((s) => s.setLinkPreviews);
  const [usageStatistics, setUsageStatisticsShown] = useState<boolean | null>(null);

  useEffect(() => {
    usage
      .isEnabled()
      .then(setUsageStatisticsShown)
      .catch(() => {});
  }, []);

  async function toggleUsageStatistics(next: boolean) {
    setUsageStatisticsShown(next);
    await usage.setEnabled(next).catch(() => setUsageStatisticsShown(!next));
  }

  return (
    <SettingsScreen title="Privacy">
      <View style={{ marginBottom: SECTION_GAP }}>
        <Section
          label="Receipts"
          description="Unread state is otherwise kept on this device only. Nothing tells anyone which chats you have open, pinned or muted."
        >
          <SettingsRow
            label="Send read receipts"
            description="Tells the other person when you have opened their message. Off by default, and it works both ways: with it off, you don't see theirs either."
            icon="check-check"
            toggle={{ value: readReceipts, onValueChange: (next) => void setReadReceipts(next) }}
          />
          <SettingsRow
            label="Send typing indicators"
            description="Shows people on Telegram and Matrix that you are typing. Off by default: it sends a signal every time you touch the keyboard."
            icon="ellipsis"
            toggle={{ value: typingIndicators, onValueChange: (next) => void setTypingIndicators(next) }}
          />
        </Section>
      </View>

      <View style={{ marginBottom: SECTION_GAP }}>
        <Section label="Links">
          <SettingsRow
            label="Show link previews"
            description="Fetches a title, description and picture for links, straight from the linked site. With no server in between, the site sees this device's address as soon as a link arrives, not only when you tap it. Turn this off to keep that to yourself."
            icon="link"
            toggle={{ value: linkPreviews, onValueChange: (next) => void setLinkPreviews(next) }}
          />
        </Section>
      </View>

      <View style={{ marginBottom: SECTION_GAP }}>
        <Section label="Usage statistics">
          <SettingsRow
            testID="usage-statistics"
            label="Share anonymous usage statistics"
            description="Sends which screens you open, Statim's version and your system to stats.laibe.cc, to count how Statim is used. Nothing you write or read. On by default."
            icon="chart-pie"
            toggle={
              usageStatistics === null
                ? undefined
                : { value: usageStatistics, onValueChange: (next) => void toggleUsageStatistics(next) }
            }
          />
        </Section>
      </View>

      <Section label="Not collected">
        <SettingsRow
          label="No last seen of our own"
          description="XMTP, Nostr and Status carry no presence. Telegram shows when you were last online, as the Telegram apps do, and Matrix does when your homeserver shares presence; this app adds nothing on top."
          icon="eye-off"
        />
        <SettingsRow
          label="No contact upload"
          description="Your address book is read on this device to suggest invites and is never sent anywhere."
          icon="users"
        />
      </Section>
    </SettingsScreen>
  );
}
