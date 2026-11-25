import { useEffect, useState } from "react";
import { View } from "react-native";

import {
  Button,
  desktop,
  FieldError,
  Radius,
  SECTION_GAP,
  Section,
  SettingsRow,
  Space,
  Text,
  useThemeColors,
} from "@/design";
import { copyText } from "@/design/copy-text";
import { isCliAllowed, setCliAllowed } from "@/features/cli/access";
import { type CliInstall, cliInstall, cliLink } from "@/features/cli/install";
import { SettingsScreen } from "@/features/settings/settings-screen";
import { guideUrl } from "@/lib/guide";
import { openExternal } from "@/lib/open-url";

const SKILLS = "statim skills install";
const CLAUDE_CODE_MCP = "claude mcp add --scope user statim -- statim mcp";

function mcpSettings(path: string): string {
  return JSON.stringify({ mcpServers: { statim: { command: path, args: ["mcp"] } } }, null, 2);
}

/** A command to paste in a terminal, as code on `bg` with its copy button. */
function Command({ command, done }: { command: string; done: string }) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: Space[3],
        padding: Space[3],
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: Radius.md,
      }}
    >
      <Text variant="code" selectable style={{ flex: 1 }}>
        {command}
      </Text>
      <Button icon="copy" label="Copy" size="sm" onPress={() => copyText(command, done)} />
    </View>
  );
}

function Block({ children }: { children: React.ReactNode }) {
  return <View className={desktop ? "gap-3 py-3" : "gap-3 p-4"}>{children}</View>;
}

export default function CommandLineScreen() {
  const [install, setInstall] = useState<CliInstall | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    cliInstall()
      .then(setInstall)
      .catch(() => {});
    isCliAllowed()
      .then(setAllowed)
      .catch(() => {});
  }, []);

  async function link() {
    setLinking(true);
    setLinkError(null);
    try {
      if (await cliLink()) setInstall(await cliInstall());
    } catch (error) {
      setLinkError(String(error));
    } finally {
      setLinking(false);
    }
  }

  async function toggle(next: boolean) {
    setAllowed(next);
    await setCliAllowed(next).catch(() => setAllowed(!next));
  }

  return (
    <SettingsScreen
      title="Command line"
      intro="statim does from a terminal whatever this app does: read and send messages, manage chats and groups, run plugin commands. It talks to this app, and starts it in the background when it is closed. Anything that signs, erases or turns on a plugin waits for you to approve it here."
    >
      <View style={{ marginBottom: SECTION_GAP }}>
        <Section>
          <SettingsRow
            testID="cli-allowed"
            label="Allow the command line"
            description="While this is on, any program running as you on this computer can read and send your messages through it, without asking. Off by default."
            icon="terminal"
            toggle={{ value: allowed, onValueChange: (next) => void toggle(next) }}
          />
        </Section>
      </View>

      <View style={{ marginBottom: SECTION_GAP }}>
        <Section label="Install">
          <Block>
            {install?.installed ? (
              <Text size="sm" tone="muted">
                Installed. Open a terminal and run statim help.
              </Text>
            ) : install?.command ? (
              <>
                <Text size="sm" tone="muted">
                  Adds statim to your PATH, so any terminal can run it.
                </Text>
                <Button
                  variant="primary"
                  label="Install"
                  busy={linking}
                  onPress={() => void link()}
                  testID="cli-link"
                />
                {linkError ? (
                  <>
                    <FieldError>{`That didn't work: ${linkError}. Run this once in Terminal instead.`}</FieldError>
                    <Command command={install.command} done="Copied the command" />
                  </>
                ) : null}
              </>
            ) : null}
          </Block>
        </Section>
      </View>

      <View style={{ marginBottom: SECTION_GAP }}>
        <Section label="AI agents">
          <Block>
            <Text size="sm" tone="muted">
              Teaches Claude Code how to use it. Add --codex for Codex, or --dir with a folder for another agent.
            </Text>
            <Command command={SKILLS} done="Copied the command" />
          </Block>
        </Section>
      </View>

      <Section label="AI apps over MCP">
        <Block>
          <Text size="sm" tone="muted">
            Apps that take an MCP server can use these commands as tools, while the command line is allowed. For Claude
            Code, run:
          </Text>
          <Command command={CLAUDE_CODE_MCP} done="Copied the command" />
          {install?.path ? (
            <>
              <Text size="sm" tone="muted">
                Claude Desktop, Cursor and LM Studio read a settings file instead. In Claude Desktop it is Settings ›
                Developer › Edit Config, not Connectors, which only take web addresses. Add this to it, then quit and
                reopen the app.
              </Text>
              <Command command={mcpSettings(install.path)} done="Copied the settings" />
            </>
          ) : null}
          <Button
            label="How to add it to Codex and other apps"
            trailingIcon="arrow-up-right"
            size="sm"
            onPress={() => openExternal(guideUrl("command-line", "ai-apps-over-mcp")).catch(() => {})}
          />
        </Block>
      </Section>
    </SettingsScreen>
  );
}
