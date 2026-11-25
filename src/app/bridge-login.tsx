import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";
import { useChatStore } from "@/core/messaging/chat-store";
import { BRIDGED_NETWORKS } from "@/core/messaging/networks";
import type { ChatSession } from "@/core/messaging/protocol";
import { Button, DialogHeader, desktop, IconButton, Notice, PhoneHeader, Screen, Skeleton, Text } from "@/design";
import { connectByChat } from "@/features/bridge-login/connect-by-chat";
import { FlowPicker, InputStep, WaitStep } from "@/features/bridge-login/steps";
import { useBridgeLogin } from "@/features/bridge-login/use-bridge-login";
import { WebLogin } from "@/features/bridge-login/web-login";
import { useBack } from "@/features/navigation/use-back";
import { bridgeBotId, type KnownBridge, knownBridge, provisioningName } from "@/protocols/matrix/bridges";
import type { MatrixCapabilities } from "@/protocols/matrix/provisioning";

export default function BridgeLoginScreen() {
  const { bridge: localpart } = useLocalSearchParams<{ bridge: string }>();
  const goBack = useBack("/settings/protocol/matrix");
  const bridge = knownBridge(localpart ?? "");

  if (!bridge) {
    return (
      <Screen className="items-center justify-center">
        <Text tone="muted">No bridge called “{localpart}”.</Text>
      </Screen>
    );
  }
  return <BridgeLogin bridge={bridge} goBack={goBack} />;
}

function BridgeLogin({ bridge, goBack }: { bridge: KnownBridge; goBack: () => void }) {
  const session = useChatStore((s) => s.sessions.matrix) as (ChatSession & Partial<MatrixCapabilities>) | undefined;
  const provisioning = useMemo(
    () => session?.bridgeProvisioning?.(provisioningName(bridge)) ?? null,
    [bridge, session],
  );

  const login = useBridgeLogin(provisioning);
  const { phase, step } = login;
  const label = BRIDGED_NETWORKS[bridge.network];

  return (
    <Screen edges={["bottom"]}>
      {desktop ? (
        <View className="flex-row items-start">
          <View className="flex-1">
            <DialogHeader label="Bridge" title={`Connect ${label}`} />
          </View>
          <View className="p-3">
            <IconButton icon="x" label="Close" size="sm" onPress={goBack} />
          </View>
        </View>
      ) : (
        <PhoneHeader title={`Connect ${label}`} action={<IconButton icon="x" label="Close" onPress={goBack} />} />
      )}

      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName={desktop ? "gap-4 px-5 pb-5" : "gap-4 p-4"}
        >
          {phase === "loading" ? <Skeleton rows={3} lines={1} /> : null}

          {phase === "unavailable" ? (
            <View className="gap-3">
              <Text tone="muted">
                This homeserver does not let the app sign in to {label} directly. You can still connect by chatting with
                the bridge’s bot.
              </Text>
              <Button
                variant="primary"
                label="Connect in a chat"
                trailingIcon="arrow-right"
                fullWidth
                onPress={() => {
                  goBack();
                  void connectByChat(bridge, bridgeBotId(bridge, session?.self.address ?? ""));
                }}
              />
            </View>
          ) : null}

          {phase === "flows" ? (
            <FlowPicker whoami={login.whoami} network={label} preferred={bridge.preferredFlow} onPick={login.start} />
          ) : null}

          {phase === "step" && step ? (
            <View className="gap-4">
              {step.instructions && step.type !== "cookies" ? <Text tone="muted">{step.instructions}</Text> : null}
              {step.type === "user_input" ? (
                <InputStep
                  key={`${step.login_id}/${step.step_id}`}
                  step={step}
                  busy={login.busy}
                  onSubmit={login.submit}
                />
              ) : step.type === "display_and_wait" ? (
                <WaitStep step={step} />
              ) : step.type === "cookies" && step.cookies ? (
                <WebLogin
                  key={`${step.login_id}/${step.step_id}`}
                  params={step.cookies}
                  network={label}
                  onValues={login.submit}
                  onCancel={login.restart}
                />
              ) : (
                <Notice
                  tone="warning"
                  message="This way of signing in needs something the app can’t do yet."
                  detail="Pick another one, or connect in a chat with the bridge’s bot."
                  action={{ label: "Choose another way", onPress: login.restart }}
                />
              )}
              {step.type !== "cookies" ? (
                <Button label="Start over" variant="ghost" size="sm" onPress={login.restart} />
              ) : null}
            </View>
          ) : null}

          {phase === "done" ? (
            <View className="gap-3">
              <Notice
                tone="success"
                message={`Connected ${label}.`}
                detail="Your chats appear in the chat list as the bridge catches up. Older history can take a few minutes."
              />
              <Button variant="primary" label="Done" fullWidth onPress={goBack} />
            </View>
          ) : null}

          {login.error ? <Notice tone="danger" message="That didn’t work." detail={login.error} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
