import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, ListItem, Section, Text, Toggle } from '@/design';
import { copyText } from '@/design/copy-text';
import { isCliAllowed, setCliAllowed } from '@/features/cli/access';
import { cliInstall, cliLink, type CliInstall } from '@/features/cli/install';
import { SettingsScreen } from '@/features/settings/settings-screen';
import { guideUrl } from '@/lib/guide';
import { openExternal } from '@/lib/open-url';

const SKILLS = 'statim skills install';
const CLAUDE_CODE_MCP = 'claude mcp add --scope user statim -- statim mcp';

function mcpSettings(path: string): string {
  return JSON.stringify({ mcpServers: { statim: { command: path, args: ['mcp'] } } }, null, 2);
}

function Command({ command, done }: { command: string; done: string }) {
  return (
    <Card className="gap-3">
      <Text selectable className="font-mono text-sm">
        {command}
      </Text>
      <Button label="Copy" tone="neutral" size="sm" onPress={() => copyText(command, done)} />
    </Card>
  );
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
    <SettingsScreen title="Command line">
      <View className="gap-2 px-gutter pb-6">
        <Text variant="body">
          statim does from a terminal whatever this app does: read and send messages, manage chats
          and groups, run plugin commands. It talks to this app, and starts it in the background
          when it is closed.
        </Text>
        <Text variant="footnote">
          Anything that signs, erases or turns on a plugin waits for you to approve it here.
        </Text>
      </View>

      <Section surface="card" className="mb-6">
        <ListItem
          testID="cli-allowed"
          title="Allow the command line"
          subtitle="While this is on, any program running as you on this computer can read and send your messages through it, without asking. Off by default."
          numberOfLinesSubtitle={4}
          trailing={
            <Toggle label="Allow the command line" value={allowed} onValueChange={toggle} />
          }
        />
      </Section>

      <Section title="Install" surface="card" className="mb-6">
        <View className="gap-3 p-4">
          {install?.installed ? (
            <Text variant="footnote">Installed. Open a terminal and run statim help.</Text>
          ) : install?.command ? (
            <>
              <Text variant="footnote">Adds statim to your PATH, so any terminal can run it.</Text>
              <Button
                label="Install"
                size="sm"
                loading={linking}
                onPress={() => void link()}
                testID="cli-link"
              />
              {linkError ? (
                <>
                  <Text variant="footnote">
                    That did not work: {linkError}. Run this once in Terminal instead.
                  </Text>
                  <Command command={install.command} done="Command copied" />
                </>
              ) : null}
            </>
          ) : null}
        </View>
      </Section>

      <Section title="AI agents" surface="card" className="mb-6">
        <View className="gap-3 p-4">
          <Text variant="footnote">
            Teaches Claude Code how to use it. Add --codex for Codex, or --dir with a folder for
            another agent.
          </Text>
          <Command command={SKILLS} done="Command copied" />
        </View>
      </Section>

      <Section title="AI apps over MCP" surface="card" className="mb-6">
        <View className="gap-3 p-4">
          <Text variant="footnote">
            Apps that take an MCP server can use these commands as tools, while the command line is
            allowed. For Claude Code, run:
          </Text>
          <Command command={CLAUDE_CODE_MCP} done="Command copied" />
          {install?.path ? (
            <>
              <Text variant="footnote">
                Claude Desktop, Cursor and LM Studio read a settings file instead. In Claude Desktop
                it is Settings › Developer › Edit Config, not Connectors, which only take web
                addresses. Add this to it, then quit and reopen the app.
              </Text>
              <Command command={mcpSettings(install.path)} done="Settings copied" />
            </>
          ) : null}
          <Button
            label="How to add it to Codex and other apps"
            tone="neutral"
            size="sm"
            onPress={() =>
              openExternal(guideUrl('command-line', 'ai-apps-over-mcp')).catch(() => {})
            }
          />
        </View>
      </Section>
    </SettingsScreen>
  );
}
