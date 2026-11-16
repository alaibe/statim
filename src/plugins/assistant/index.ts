import { liveViews } from "@/core/plugins/live";
import type { Plugin } from "@/core/plugins/types";
import { makeStatimBot } from "./bot";
import { assistantCommands, pluginsCard } from "./commands";

export const assistantPlugin: Plugin = {
  manifest: {
    id: "assistant",
    name: "Statim Assistant",
    description: "Your on-device space for notes, slash commands and discovering features.",
    version: "1.0.0",
    icon: "sparkles-outline",
    permissions: ["account.read", "plugins.manage", "storage"],
  },

  setup(context) {
    const views = liveViews(context, { plugins: () => pluginsCard(context) });
    return {
      bots: [makeStatimBot()],
      commands: assistantCommands(views),
      views,

      composerActions: [
        {
          id: "commands",
          label: "Commands",
          icon: "sparkles-outline",
          command: "/commands",
          showIn: ["dm", "group", "channel"],
          global: true,
        },
        {
          id: "plugins",
          label: "Plugins",
          icon: "extension-puzzle-outline",
          command: "/plugins",
          showIn: ["channel"],
        },
      ],
    };
  },
};
