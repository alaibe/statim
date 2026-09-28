import { ActivityIndicator, View } from 'react-native';

import { type ProtocolConnection, useChatStore } from '@/core/messaging/chat-store';
import { protocolEntries, type ProtocolId } from '@/core/messaging/namespace';
import { Pressable, Text, useThemeColors } from '@/design';
import { networkLabel } from '@/features/protocols/presentation';

/** Shared by the chat list and the oldest end of a chat's transcript. */
export function HistoryStatus({
  protocol,
  compact = false,
}: {
  protocol?: ProtocolId;
  compact?: boolean;
}) {
  const colors = useThemeColors();
  const protocols = useChatStore((s) => s.protocols);
  const syncProtocol = useChatStore((s) => s.syncProtocol);
  const entries = protocolEntries(protocols).filter(([id]) => !protocol || id === protocol);
  const fetching = entries.filter(([, state]) => state.history.status === 'fetching');
  const connecting = entries.filter(([, state]) => state.status === 'connecting');
  const failed = entries.filter(([, state]) => state.history.status === 'error');
  const partial = entries.filter(([, state]) => state.history.status === 'partial');
  const active = [
    ...fetching,
    ...connecting.filter(([id]) => !fetching.some(([key]) => key === id)),
  ];

  if (active.length === 0 && failed.length === 0 && partial.length === 0) return null;
  const describe = compact ? summary : details;

  return (
    <View
      className={compact ? 'gap-0.5 px-gutter py-1.5' : 'gap-1 px-gutter py-3'}
      accessibilityLiveRegion="polite">
      {active.length > 0 ? (
        <View
          className="flex-row items-center gap-2"
          accessible
          accessibilityLabel={`${fetching.length ? 'Fetching history' : 'Connecting'}: ${active.map(([id]) => networkLabel(id)).join(', ')}`}>
          <ActivityIndicator size="small" color={colors['content-subtle']} />
          <Text variant="caption" className="flex-1">
            {fetching.length ? 'Fetching history…' : 'Connecting…'}
            {' · '}
            {active.map(([id]) => networkLabel(id)).join(' · ')}
          </Text>
        </View>
      ) : null}
      {failed.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Retry fetching history. ${details(failed)}`}
          onPress={() => {
            for (const [id] of failed) void syncProtocol(id);
          }}
          className="py-1">
          <Text variant="caption" numberOfLines={1}>
            {describe(failed)} · Retry
          </Text>
        </Pressable>
      ) : null}
      {partial.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Retry unavailable relays. ${details(partial)}`}
          onPress={() => {
            for (const [id] of partial) void syncProtocol(id);
          }}
          className="py-1">
          <Text variant="caption" numberOfLines={1}>
            {describe(partial)} · Retry
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function summary(entries: [ProtocolId, unknown][]): string {
  return `${entries.map(([id]) => networkLabel(id)).join(', ')}: some history unavailable`;
}

function details(entries: [ProtocolId, ProtocolConnection][]): string {
  return entries
    .map(([id, state]) => `${networkLabel(id)}: ${state.history.error ?? 'History unavailable'}`)
    .join(' · ');
}
