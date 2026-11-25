import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { describeKind } from "@/core/account/account-kind";
import { useAccountStore } from "@/core/account/account-store";
import type { AccountRecord } from "@/core/account/accounts";
import { hardwareVendors } from "@/core/account/hardware";
import { shortAddress } from "@/core/account/keyring";
import { eraseAccount } from "@/core/app/erase-account";
import { Avatar, Button, ConfirmDialog, Icon, Menu, Notice, Row, SECTION_GAP, Section, SwipeableRow } from "@/design";
import { ConnectHardware } from "@/features/account/connect-hardware";
import { RenameAccountSheet } from "@/features/settings/rename-account-sheet";
import { SettingsScreen } from "@/features/settings/settings-screen";
import { useAction } from "@/features/use-action";

export default function AccountsScreen() {
  const router = useRouter();

  const accounts = useAccountStore((s) => s.accounts);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const selectAccount = useAccountStore((s) => s.selectAccount);
  const needsChatKeys = useAccountStore((s) => s.keyring !== null && s.keyring.chatKey === null);
  const setUpChatKeys = useAction(useAccountStore.getState().setUpChatKeys, {
    failure: "Couldn't set up chat keys",
  });

  const [managing, setManaging] = useState<AccountRecord | null>(null);
  const [renaming, setRenaming] = useState<AccountRecord | null>(null);
  const [confirmWipe, setConfirmWipe] = useState<AccountRecord | null>(null);
  const erase = useAction(eraseAccount, { failure: "Couldn't erase that account" });
  const open = useAction(
    async (id: string) => {
      await selectAccount(id);
      router.replace("/chats");
    },
    { failure: "Couldn't open that account" },
  );
  const [connecting, setConnecting] = useState(false);

  return (
    <SettingsScreen
      title="Accounts"
      intro="Each account has its own keys, its own message database and its own plugin settings. Nothing is shared between them. Tap one to switch to it, hold to rename or erase it."
    >
      <View style={{ marginBottom: SECTION_GAP }}>
        <Section label="On this device">
          {accounts.map((account) => (
            <SwipeableRow
              key={account.id}
              right={[
                {
                  id: "erase",
                  label: "Erase",
                  icon: "trash-2",
                  destructive: true,
                  onPress: () => setConfirmWipe(account),
                },
              ]}
            >
              <Row
                testID={`account-${account.id}`}
                title={account.label}
                preview={
                  account.kind === "hardware"
                    ? `${shortAddress(account.address, 8, 6)} · ${describeKind("hardware")}`
                    : shortAddress(account.address, 10, 8)
                }
                leading={<Avatar label={account.label} shape="square" size={40} />}
                trailing={account.id === activeAccountId ? <Icon name="check" size={20} tone="accent" /> : undefined}
                onLongPress={() => setManaging(account)}
                onContextMenu={() => setManaging(account)}
                onPress={async () => {
                  if (account.id === activeAccountId) setManaging(account);
                  else await open.run(account.id);
                }}
              />
            </SwipeableRow>
          ))}
        </Section>
      </View>

      {needsChatKeys ? (
        <View className="mb-6 gap-3 px-4">
          <Notice
            tone="accent"
            tag="Keys"
            message="Nostr, Status and notifications from your computer need chat keys for this account."
            detail="Your wallet makes them by signing one message, which moves no funds."
          />
          <Button
            testID="set-up-chat-keys"
            variant="primary"
            label="Set up chat keys"
            fullWidth
            busy={setUpChatKeys.busy}
            onPress={() => void setUpChatKeys.run()}
          />
        </View>
      ) : null}

      <View className="gap-2 px-4">
        <Button
          icon="plus"
          label="Create a new account"
          fullWidth
          onPress={() => router.push("/(onboarding)/create")}
        />
        <Button
          icon="download"
          label="Import a recovery phrase"
          fullWidth
          onPress={() => router.push("/(onboarding)/import")}
        />
        {hardwareVendors().length > 0 ? (
          <Button
            testID="connect-hardware"
            icon="bluetooth"
            label="Connect a hardware wallet…"
            fullWidth
            onPress={() => setConnecting(true)}
          />
        ) : null}
      </View>

      <ConnectHardware visible={connecting} onClose={() => setConnecting(false)} />

      {managing ? (
        <Menu
          visible
          onClose={() => setManaging(null)}
          title={managing.label}
          items={[
            { label: "Rename…", icon: "square-pen", onPress: () => setRenaming(managing) },
            { label: "Erase this account…", icon: "trash-2", danger: true, onPress: () => setConfirmWipe(managing) },
          ]}
        />
      ) : null}

      {renaming ? <RenameAccountSheet account={renaming} onClose={() => setRenaming(null)} /> : null}

      {confirmWipe ? (
        <ConfirmDialog
          visible
          onClose={() => setConfirmWipe(null)}
          label="Erase account"
          title="Erase this account?"
          body={`This deletes ${confirmWipe.label}'s keys, messages and plugin data from this device. Nobody else holds them, so without its recovery phrase written down the account can't be recovered. Your other accounts are untouched.`}
          confirm={{
            label: "Erase account",
            busyLabel: "Erasing…",
            danger: true,
            onPress: async () => {
              const next = accounts.length === 1 ? "/(onboarding)/welcome" : "/chats";
              if (!(await erase.run(confirmWipe.id))) return;
              setConfirmWipe(null);
              router.replace(next);
            },
          }}
        />
      ) : null}
    </SettingsScreen>
  );
}
