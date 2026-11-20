import { errorMessage } from "@/core/errors";
import { botChatId } from "@/core/messaging/bots";
import { useChatStore } from "@/core/messaging/chat-store";
import { liveViews } from "@/core/plugins/live";
import type { Plugin, PluginContext, UriHandler } from "@/core/plugins/types";

import { addressCard } from "./address-card";
import { makeWalletBot, WALLET_BOT_ID } from "./bot";
import {
  chainsCard,
  chainsCommand,
  disposeStrategies,
  enabledChains,
  pickEvm,
  syncStrategies,
  walletChainById,
} from "./chain-list";
import { hydrateRpcOverrides } from "./chains/rpc";
import { isChainOn } from "./chains/strategy";
import { watchCommands, watchedCard } from "./chains/watch-commands";
import { channelCommands, endpointCard } from "./channel-commands";
import { walletCommands } from "./commands";
import { walletContentTypes } from "./content-types";
import { findPaymentLink, PAYMENT_SCHEMES, parsePaymentLink, paymentCard, paymentRequest } from "./payment-link";
import { findSignature, signatureCard } from "./solana/signature";
import { tokensCommand } from "./tokens";
import { tradeCommand } from "./trade";

export const walletPlugin: Plugin = {
  manifest: {
    id: "wallet",
    name: "Wallet",
    description: "Balances, sends, trades and payment requests, on the chains you switch on.",
    version: "2.0.0",
    icon: "wallet-outline",
    permissions: ["account.read", "account.sign", "chat.read", "chat.send", "browser.open", "network", "storage"],
    requiresSessionRestart: true,
  },

  setup(context: PluginContext) {
    const views = liveViews(context, {
      address: ([value, mode]) => addressCard(context, value, { offerSend: mode !== "no-send" }),
      chains: () => chainsCard(context),
      payment: ([uri]) => paymentCard(uri),
      "solana-transaction": ([signature]) => signatureCard(signature),
      endpoint: ([id]) => {
        const chain = walletChainById(id);
        if (!chain) throw new Error(`No chain called "${id}".`);
        return endpointCard(context, chain);
      },
      watched: ([id]) => {
        const chain = walletChainById(id)?.evm;
        if (!chain) throw new Error(`No EVM chain called "${id}".`);
        return watchedCard(context, chain, id);
      },
    });

    return {
      bots: [makeWalletBot(context)],
      contentTypes: walletContentTypes,
      views,
      textPreviews: [
        {
          view: "payment",
          match: (text) => {
            const uri = findPaymentLink(text);
            return uri ? [uri] : null;
          },
        },
        {
          view: "solana-transaction",
          match: (text) => {
            if (!isChainOn("solana")) return null;
            const signature = findSignature(text);
            return signature ? [signature] : null;
          },
        },
      ],
      uriHandlers: [paymentLinks],

      commands: [
        ...walletCommands,
        tradeCommand,
        tokensCommand,
        ...channelCommands(context, views),
        ...watchCommands((args) => pickEvm(context, args), views),
        chainsCommand(context, views),
      ],

      composerActions: [
        {
          id: "request",
          label: "Request",
          icon: "arrow-down-circle-outline",
          command: "/request",
          showIn: ["dm", "group"],
        },
        {
          id: "send",
          label: "Send",
          icon: "arrow-up-circle-outline",
          command: "/send",
          showIn: ["dm", "group"],
        },
        {
          id: "balance",
          label: "Balance",
          icon: "wallet-outline",
          command: "/balance",
          showIn: ["channel"],
        },
        {
          id: "channel-send",
          label: "Send",
          icon: "arrow-up-circle-outline",
          command: "/send",
          showIn: ["channel"],
        },
        {
          id: "trade",
          label: "Trade",
          icon: "swap-horizontal-outline",
          command: "/trade",
          showIn: ["channel"],
        },
        {
          id: "chains",
          label: "Chains",
          icon: "git-network-outline",
          command: "/chains",
          showIn: ["channel"],
        },
      ],

      async start() {
        await hydrateRpcOverrides(context);
        await syncStrategies(context);
        return disposeStrategies;
      },
    };
  },
};

const paymentLinks: UriHandler = {
  schemes: PAYMENT_SCHEMES,
  async handle(url, context) {
    const link = parsePaymentLink(url);
    if (!link) return false;
    try {
      if ("error" in link) throw new Error(link.error);
      const { command } = await paymentRequest(link);
      const chatId = botChatId(WALLET_BOT_ID);
      useChatStore.getState().setDraft(chatId, command);
      context.ui.openChat(chatId);
    } catch (error) {
      context.ui.notify(errorMessage(error, "Could not read that payment link"), "error");
    }
    return true;
  },
};

export { enabledChains };
