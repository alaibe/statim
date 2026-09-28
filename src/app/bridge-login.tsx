import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';

import { Button, Card, ModalHeader, Note, Screen, Text } from '@/design';
import { useChatStore } from '@/core/messaging/chat-store';
import { BRIDGED_NETWORKS } from '@/core/messaging/networks';
import type { ChatSession } from '@/core/messaging/protocol';
import { connectByChat } from '@/features/bridge-login/connect-by-chat';
import { FlowPicker, InputStep, WaitStep } from '@/features/bridge-login/steps';
import { useBridgeLogin } from '@/features/bridge-login/use-bridge-login';
import { WebLogin } from '@/features/bridge-login/web-login';
import { useBack } from '@/features/navigation/use-back';
import {
  bridgeBotId,
  type KnownBridge,
  knownBridge,
  provisioningName,
} from '@/protocols/matrix/bridges';
import type { MatrixCapabilities } from '@/protocols/matrix/provisioning';

export default function BridgeLoginScreen() {
  const { bridge: localpart } = useLocalSearchParams<{ bridge: string }>();
  const goBack = useBack('/settings/protocol/matrix');
  const bridge = knownBridge(localpart ?? '');

  if (!bridge) {
    return (
      <Screen className="items-center justify-center">
        <Text variant="footnote">No bridge called “{localpart}”.</Text>
      </Screen>
    );
  }
  return <BridgeLogin bridge={bridge} goBack={goBack} />;
}

function BridgeLogin({ bridge, goBack }: { bridge: KnownBridge; goBack: () => void }) {
  const session = useChatStore((s) => s.sessions.matrix) as
    | (ChatSession & Partial<MatrixCapabilities>)
    | undefined;
  const provisioning = useMemo(
    () => session?.bridgeProvisioning?.(provisioningName(bridge)) ?? null,
    [bridge, session]
  );

  const login = useBridgeLogin(provisioning);
  const { phase, step } = login;
  const label = BRIDGED_NETWORKS[bridge.network];

  return (
    <Screen className="px-gutter" edges={['top', 'bottom']}>
      <ModalHeader title={`Connect ${label}`} onClose={goBack} />

      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 pb-6">
          {phase === 'loading' ? <Text variant="caption">Asking the bridge…</Text> : null}

          {phase === 'unavailable' ? (
            <Card className="gap-3">
              <Text variant="footnote">
                This homeserver does not let the app sign in to {label} directly. You can still
                connect by chatting with the bridge’s bot.
              </Text>
              <Button
                label="Connect in a chat"
                size="md"
                fullWidth
                onPress={() => {
                  goBack();
                  void connectByChat(bridge, bridgeBotId(bridge, session?.self.address ?? ''));
                }}
              />
            </Card>
          ) : null}

          {phase === 'flows' ? (
            <FlowPicker
              whoami={login.whoami}
              network={label}
              preferred={bridge.preferredFlow}
              onPick={login.start}
            />
          ) : null}

          {phase === 'step' && step ? (
            <View className="gap-4">
              {step.instructions && step.type !== 'cookies' ? (
                <Text variant="footnote">{step.instructions}</Text>
              ) : null}
              {step.type === 'user_input' ? (
                <InputStep
                  key={`${step.login_id}/${step.step_id}`}
                  step={step}
                  busy={login.busy}
                  onSubmit={login.submit}
                />
              ) : step.type === 'display_and_wait' ? (
                <WaitStep step={step} />
              ) : step.type === 'cookies' && step.cookies ? (
                <WebLogin
                  key={`${step.login_id}/${step.step_id}`}
                  params={step.cookies}
                  network={label}
                  onValues={login.submit}
                  onCancel={login.restart}
                />
              ) : (
                <Card className="gap-3">
                  <Text variant="footnote">
                    This way of signing in needs something the app cannot do yet. Pick another one,
                    or connect in a chat with the bridge’s bot.
                  </Text>
                  <Button label="Choose another way" tone="neutral" onPress={login.restart} />
                </Card>
              )}
              {step.type !== 'cookies' ? (
                <Button label="Start over" tone="ghost" size="sm" onPress={login.restart} />
              ) : null}
            </View>
          ) : null}

          {phase === 'done' ? (
            <Card className="gap-3">
              <Text className="font-semibold">{label} is connected</Text>
              <Text variant="footnote">
                Your chats appear in the chat list as the bridge catches up. Older history can take
                a few minutes.
              </Text>
              <Button label="Done" size="md" fullWidth onPress={goBack} />
            </Card>
          ) : null}

          {login.error ? (
            <Note tone="danger" title="That did not work">
              {login.error}
            </Note>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
