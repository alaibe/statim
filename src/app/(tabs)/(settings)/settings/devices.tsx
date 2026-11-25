import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { errorMessage } from "@/core/errors";
import { useChatStore, xmtpSessionFor } from "@/core/messaging/chat-store";
import { formatDayLabel } from "@/core/messaging/preview";
import type { XmtpInstallation as Installation } from "@/core/messaging/protocol";
import { ConfirmDialog, Notice, SECTION_GAP, Section, SettingsRow, Skeleton, Tag } from "@/design";
import { SettingsScreen } from "@/features/settings/settings-screen";
import { useAction } from "@/features/use-action";
import { listXmtpInstallations, revokeXmtpInstallations } from "@/features/xmtp-devices";

export default function DevicesScreen() {
  const session = useChatStore(xmtpSessionFor);

  const [installations, setInstallations] = useState<Installation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Installation | null>(null);

  const load = useCallback(async () => {
    try {
      setInstallations(await listXmtpInstallations());
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "Couldn't read your devices"));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load, session]);

  const revoke = useAction(
    async (installation: Installation) => {
      await revokeXmtpInstallations([installation.id]);
      await load();
    },
    { success: "Revoked the device", failure: "Couldn't revoke that device" },
  );

  const others = (installations ?? []).filter((i) => !i.current);
  const here = (installations ?? []).find((i) => i.current);

  return (
    <SettingsScreen
      title="Devices"
      intro="Each device holds its own keys and its own copy of your messages. Nothing sits on a server for a new device to download, which is why a fresh install starts empty, and why revoking a device cuts it off for good."
    >
      {error ? (
        <View className="mb-6 px-4">
          <Notice tone="danger" message={error} action={{ label: "Retry", onPress: () => void load() }} />
        </View>
      ) : null}

      {installations === null ? (
        error ? null : (
          <Skeleton rows={3} />
        )
      ) : (
        <>
          <View style={{ marginBottom: SECTION_GAP }}>
            <Section
              label="This device"
              empty="Not connected to XMTP. If every installation slot is taken, revoke an old device below, then reconnect."
            >
              {here ? (
                <SettingsRow
                  label="Signed in here"
                  description={describe(here)}
                  icon="smartphone"
                  control={<Tag tone="accent" label="Current" />}
                />
              ) : null}
            </Section>
          </View>

          <Section
            label={others.length > 0 ? `Other devices · ${others.length}` : "Other devices"}
            empty="This account is only signed in here."
          >
            {others.map((installation) => (
              <SettingsRow
                key={installation.id}
                label={`Device ${installation.id.slice(0, 8)}`}
                description={describe(installation)}
                icon="smartphone"
                onPress={() => setConfirming(installation)}
              />
            ))}
          </Section>
        </>
      )}

      <ConfirmDialog
        visible={confirming !== null}
        onClose={() => setConfirming(null)}
        label="Revoke device"
        title="Revoke this device?"
        body={[
          "That device will no longer be able to read or send messages for this account. It can't be undone: the device would have to be added again from scratch, and it would start with no history.",
          "This needs a signature from your account.",
        ]}
        confirm={{
          label: "Revoke device",
          busyLabel: "Revoking…",
          danger: true,
          onPress: async () => {
            if (confirming) await revoke.run(confirming);
            setConfirming(null);
          },
        }}
      />
    </SettingsScreen>
  );
}

function describe(installation: Installation): string {
  const id = `${installation.id.slice(0, 12)}…`;
  return installation.createdAt ? `Added ${formatDayLabel(installation.createdAt)} · ${id}` : id;
}
