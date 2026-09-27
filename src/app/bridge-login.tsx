import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';

import { Button, Card, ModalHeader, Note, Screen, Text } from '@/design';
import { useChatStore } from '@/core/messaging/chat-store';
import type { ChatSession } from '@/core/messaging/protocol';
import { connectByChat } from '@/features/bridge-login/connect-by-chat';
import { FlowPicker, InputStep, WaitStep } from '@/features/bridge-login/steps';
import { useBridgeLogin } from '@/features/bridge-login/use-bridge-login';
import { WebLogin } from '@/features/bridge-login/web-login';
import { useBack } from '@/features/navigation/use-back';
import { bridgeBotId, knownBridge, provisioningName } from '@/protocols/matrix/bridges';
import type { MatrixCapabilities } from '@/protocols/matrix/provisioning';

export default function BridgeLoginScreen() {
  const { bridge: localpart } = useLocalSearchParams<{ bridge: string }>();
  const goBack = useBack('/settings/protocol/matrix');
  const bridge = knownBridge(localpart ?? '');
  const session = useChatStore((s) => s.sessions.matrix) as
    | (ChatSession & Partial<MatrixCapabilities>)
    | undefined;
  const provisioning = useMemo(
    () => (bridge ? (session?.bridgeProvisioning?.(provisioningName(bridge)) ?? null) : null),
    [bridge, session]
  );

  const login = useBridgeLogin(provisioning);

  if (!bridge) {
    return (
      <Screen className="items-center justify-center">
        <Text variant="footnote">No bridge called “{localpart}”.</Text>
      </Screen>
    );
  }

  const { phase, step } = login;

  return (
    <Screen className="px-gutter" edges={['top', 'bottom']}>
      <ModalHeader title={`Connect ${bridge.network}`} onClose={goBack} />

      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 pb-6">
          {phase === 'loading' ? <Text variant="caption">Asking the bridge…</Text> : null}

          {phase === 'unavailable' ? (
            <Card className="gap-3">
              <Text variant="footnote">
                This homeserver does not let the app sign in to {bridge.network} directly. You can
                still connect by chatting with the bridge’s bot.
              </Text>
              <Button
                label="Connect in a chat"
                size="md"
                fullWidth
                onPress={() => {
                  goBack();
                  connectByChat(bridge, bridgeBotId(bridge, session?.self.address ?? ''));
                }}
              />
            </Card>
          ) : null}

          {phase === 'flows' ? (
            <FlowPicker
              whoami={login.whoami}
              network={bridge.network}
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
                  onSubmit={(values) => login.submit(step, values)}
                />
              ) : step.type === 'display_and_wait' ? (
                <WaitStep step={step} />
              ) : step.type === 'cookies' && step.cookies ? (
                <WebLogin
                  key={`${step.login_id}/${step.step_id}`}
                  params={step.cookies}
                  network={bridge.network}
                  onValues={(values) => login.submit(step, values)}
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
              <Text className="font-semibold">{bridge.network} is connected</Text>
              <Text variant="footnote">
                Your conversations appear in the chat list as the bridge catches up. Older history
                can take a few minutes.
              </Text>
              <Button label="Done" size="md" fullWidth onPress={goBack} />
            </Card>
          ) : null}

          {login.error ? (
            <Note tone="danger" title="That did not work">
              <Text variant="caption">{login.error}</Text>
            </Note>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
