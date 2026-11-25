import { View } from "react-native";
import { errorMessage } from "@/core/errors";
import type { PluginContext } from "@/core/plugins/types";
import { Button, DialogFooter, Section, Sheet, Tag, Text } from "@/design";

import { describeRequest } from "../rpc";
import { useWalletConnectStore } from "../walletconnect";

export function makeApprovalOverlay(context: PluginContext) {
  return function ApprovalOverlay() {
    const head = useWalletConnectStore((s) => s.queue[0]);
    const approve = useWalletConnectStore((s) => s.approveHead);
    const rejectHead = useWalletConnectStore((s) => s.rejectHead);
    const reject = () =>
      rejectHead().catch((error) =>
        context.ui.notify(errorMessage(error, "Could not tell the site you said no"), "error"),
      );

    if (!head) return null;

    const isProposal = head.kind === "proposal";
    const metadata = isProposal ? head.proposal.params.proposer.metadata : null;
    const described = isProposal ? null : describeRequest(head);

    return (
      <Sheet
        visible
        onClose={() => void reject()}
        title={isProposal ? "Connect to site" : (described?.title ?? "Request")}
      >
        <View className="gap-3">
          <Section raised>
            <View className="gap-1">
              <Text strong>{isProposal ? metadata?.name : head.siteName}</Text>
              {isProposal && metadata?.url ? <Text variant="meta">{metadata.url}</Text> : null}
              {described ? (
                <Text tone="muted" className="mt-1">
                  {described.detail}
                </Text>
              ) : null}
            </View>
          </Section>

          {isProposal ? (
            <View className="gap-2">
              <Text variant="label">This site will be able to</Text>
              <Text>• See your address</Text>
              <Text>• Ask you to sign messages and transactions</Text>
              <Text size="sm" tone="muted" className="mt-1">
                Every signature still needs your approval here.
              </Text>
            </View>
          ) : (
            <View className="flex-row">
              <Tag tone="accent" label="Signed on this device" />
            </View>
          )}

          <DialogFooter>
            <Button label="Reject" onPress={reject} />
            <Button variant="primary" label={isProposal ? "Connect" : "Approve"} onPress={() => approve(context)} />
          </DialogFooter>
        </View>
      </Sheet>
    );
  };
}
