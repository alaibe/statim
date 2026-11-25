import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useAccountStore } from "@/core/account/account-store";
import {
  Avatar,
  Button,
  Checkbox,
  Icon,
  Notice,
  Row,
  RowGroup,
  Screen,
  SearchField,
  Skeleton,
  Text,
  toast,
  useThemeColors,
} from "@/design";
import { ContactName } from "@/features/contacts/contact-name";
import {
  askForAccess,
  type ContactAccess,
  contactSortKeyFor,
  currentAccess,
  type DeviceContact,
  readDeviceContacts,
} from "@/features/contacts/device-contacts";
import { RouteHeader } from "@/features/navigation/route-header";
import { useAction } from "@/features/use-action";
import { type ShareResult, shareText, shareWithNumbers } from "@/lib/share";

function inviteText(address: string): string {
  return (
    `I'm on Statim, encrypted chat where your account is a key instead of a phone number.\n\n` + `Add me: ${address}`
  );
}

export default function InviteScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const keyring = useAccountStore((s) => s.keyring);

  const [access, setAccess] = useState<ContactAccess>("unknown");
  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (privileges: ContactAccess) => {
    if (privileges === "none" || privileges === "unknown") {
      setContacts([]);
      return;
    }
    const rows = await readDeviceContacts();
    setContacts([...rows].sort((a, b) => contactSortKeyFor(a, "family").localeCompare(contactSortKeyFor(b, "family"))));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const privileges = await currentAccess();
        setAccess(privileges);
        await load(privileges);
      } catch {
        setAccess("none");
      }
      setLoading(false);
    })();
  }, [load]);

  const q = query.trim().toLowerCase();
  const visible = q ? contacts.filter((c) => `${c.given ?? ""} ${c.family ?? ""}`.toLowerCase().includes(q)) : contacts;

  const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(c.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function report(result: ShareResult | null) {
    if (result === "copied") toast.success("Copied the invite");
    if (result === "copied-for-messages") toast.success("Copied the invite: paste it into Messages");
  }

  const allowContacts = useAction(
    async () => {
      const privileges = await askForAccess();
      setAccess(privileges);
      await load(privileges).catch(() => {});
    },
    { failure: "Couldn’t ask for your contacts" },
  );

  async function sendInvites() {
    if (!keyring) return;

    const chosen = contacts.filter((c) => selected.has(c.id));
    const numbers = chosen.map((c) => c.phone).filter((p): p is string => Boolean(p));
    const body = inviteText(keyring.address);

    report(await (numbers.length > 0 ? shareWithNumbers(numbers, body) : shareText(body)).catch(() => null));

    const skipped = chosen.length - numbers.length;
    if (skipped > 0) {
      toast.info(`${skipped} contact${skipped === 1 ? "" : "s"} had no phone number`);
    }
  }

  return (
    <Screen edges={["top"]}>
      <RouteHeader title="Invite contacts" onClose={() => router.back()} />

      <View className="flex-row items-center gap-2 px-4 pb-3 pt-3">
        <View className="flex-1">
          <SearchField onChangeText={setQuery} value={query} placeholder="Search" onClear={() => setQuery("")} />
        </View>
        {visible.length > 0 ? (
          <Button
            variant="ghost"
            label={allVisibleSelected ? "Clear" : "Select all"}
            onPress={() => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((c) => c.id)))}
          />
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <Row
          testID="share-app"
          title="Share Statim…"
          leading={<Icon name="heart" size={20} tone="muted" />}
          onPress={async () => {
            if (keyring) report(await shareText(inviteText(keyring.address)).catch(() => null));
          }}
        />

        {loading ? (
          <Skeleton rows={5} avatar />
        ) : access === "unavailable" ? (
          <View className="px-4 pt-6">
            <Notice
              tone="info"
              message="Suggestions from your address book aren’t available on this system."
              detail="Share the link above, or scan the QR code from a phone that has the app."
            />
          </View>
        ) : access === "none" || access === "unknown" ? (
          <View className="px-4 pt-6">
            <Notice
              tone="info"
              message="Your address book can suggest who to invite."
              detail="It is read on this device only, never uploaded and never matched against a server. That is why this list can’t tell you who is already here."
              action={{ label: "Allow contacts", onPress: () => allowContacts.run() }}
            />
          </View>
        ) : (
          <RowGroup label={`Contacts · ${visible.length}`}>
            {visible.map((contact) => {
              const isSelected = selected.has(contact.id);
              const name = `${contact.given ?? ""} ${contact.family ?? ""}`.trim();
              return (
                <Row
                  key={contact.id}
                  title={
                    <Text numberOfLines={1}>
                      <ContactName given={contact.given} family={contact.family} />
                    </Text>
                  }
                  accessibilityLabel={name || "Unknown"}
                  preview={contact.phone ?? "No phone number"}
                  leading={<Avatar size={40} label={name} />}
                  trailing={<Checkbox checked={isSelected} />}
                  onPress={() => toggle(contact.id)}
                />
              );
            })}
          </RowGroup>
        )}
      </ScrollView>

      {selected.size > 0 ? (
        <View
          className="absolute inset-x-0 bottom-0 px-4 pb-8 pt-3"
          style={{ backgroundColor: colors.panel, borderTopWidth: 1, borderColor: colors.line }}
        >
          <Button variant="primary" label={`Invite ${selected.size}…`} fullWidth onPress={sendInvites} />
        </View>
      ) : null}
    </Screen>
  );
}
