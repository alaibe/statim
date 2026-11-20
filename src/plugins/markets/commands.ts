import { errorMessage } from "@/core/errors";
import type { PluginContext, PluginView, SlashCommand } from "@/core/plugins/types";
import { W, type WidgetTone } from "@/design/widgets";

import { describeAlert, parseAlert, toAlert } from "./alerts";
import { DEFAULT_API_BASE, displaySymbol, formatPercent, formatPrice, normaliseSymbol, type Ticker } from "./api";
import { CHAINLINK, CHAINLINK_FEEDS, chainlink, type PriceSource, priceSource } from "./sources";
import { apiBase, isDefaultApiBase, readAlerts, saveApiBase, writeAlerts } from "./storage";

const DEFAULT_MARKETS = ["BTCUSDT", "ETHUSDT"];

const nameOf = (t: Ticker) => t.label ?? displaySymbol(t.symbol);

const ago = (seconds: number) => {
  const minutes = Math.max(0, Math.round((Date.now() / 1000 - seconds) / 60));
  return minutes < 1 ? "just now" : minutes < 120 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
};

function caption(t: Ticker, source: PriceSource): string | undefined {
  if (t.changePercent !== undefined) {
    return [
      `${formatPercent(t.changePercent)} over 24h`,
      ...(t.high !== undefined ? [`high ${formatPrice(t.high)}`] : []),
      ...(t.low !== undefined ? [`low ${formatPrice(t.low)}`] : []),
    ].join(" · ");
  }
  return t.updatedAt !== undefined ? `${source.name} feed, updated ${ago(t.updatedAt)}` : undefined;
}

const toneOf = (t: Ticker): WidgetTone =>
  t.changePercent === undefined ? "neutral" : t.changePercent >= 0 ? "success" : "danger";

export async function alertsCard(context: PluginContext) {
  const alerts = await readAlerts(context);

  if (alerts.length === 0) {
    return {
      kind: "widget" as const,
      fallback: "No alerts",
      widget: W.card([W.text("No alerts yet. Set one with /alert btc above 100000.")], {
        title: "Price alerts",
        icon: "notifications-outline",
      }),
    };
  }

  return {
    kind: "widget" as const,
    fallback: `${alerts.length} alert${alerts.length === 1 ? "" : "s"}`,
    widget: W.card(
      [
        W.rows(
          alerts.map((alert, index) => ({
            label: `${index + 1}`,
            value: describeAlert(alert),
            actions: [{ label: "Remove", command: `/unalert ${index + 1}`, tone: "danger" as const }],
          })),
        ),
        W.text("Threshold alerts clear once they fire. Percentage alerts keep going."),
      ],
      { title: "Price alerts", icon: "notifications-outline" },
    ),
  };
}

export function marketsCommands(
  context: PluginContext,
  views: { alerts: PluginView; marketapi: PluginView },
): SlashCommand[] {
  return [
    {
      name: "price",
      showIn: ["channel"],
      aliases: ["quote"],
      description: "The current price of a market",
      usage: "/price [btc | eth | SOLUSDT]",
      async run({ args, respond }) {
        const symbols = args[0] ? [normaliseSymbol(args[0])] : DEFAULT_MARKETS;
        const source = priceSource();

        try {
          const tickers = await Promise.all(symbols.map((s) => source.ticker(s)));

          await respond({
            kind: "widget",
            fallback: tickers.map((t) => `${nameOf(t)} ${formatPrice(t.price)}`).join(" · "),
            widget: W.card(
              [
                ...(tickers.length === 1
                  ? [
                      W.stat(formatPrice(tickers[0].price), {
                        label: nameOf(tickers[0]),
                        caption: caption(tickers[0], source),
                        tone: toneOf(tickers[0]),
                      }),
                    ]
                  : [
                      W.rows(
                        tickers.map((t) => ({
                          label: nameOf(t),
                          value:
                            t.changePercent === undefined
                              ? formatPrice(t.price)
                              : `${formatPrice(t.price)}  ${formatPercent(t.changePercent)}`,
                          tone: toneOf(t),
                        })),
                      ),
                    ]),
                W.actions(
                  tickers.map((t) => ({
                    label: `Alert on ${nameOf(t)}`,
                    command: `/draft /alert ${t.symbol} above `,
                    tone: "neutral" as const,
                  })),
                ),
              ],
              { title: "Markets", icon: "trending-up-outline" },
            ),
          });
          return { type: "handled" };
        } catch (error) {
          return {
            type: "error",
            message: errorMessage(error, "Could not reach the market data."),
          };
        }
      },
    },

    {
      name: "alert",
      showIn: ["channel"],
      description: "Tell the Markets chat to watch a price for you",
      usage: "/alert <market> <above|below> <price>, or /alert <market> <n>%",
      async run({ args, respond }) {
        if (args.length === 0) return { type: "setComposer", text: "/alert " };
        const spec = parseAlert(args);
        if ("error" in spec) return { type: "error", message: spec.error };

        let price: number;
        try {
          price = (await priceSource().ticker(spec.symbol)).price;
        } catch (error) {
          return { type: "error", message: errorMessage(error, "Could not price that market.") };
        }

        const alert = toAlert(spec, price, Date.now());
        await writeAlerts(context, [...(await readAlerts(context)), alert]);

        await respond({
          kind: "widget",
          fallback: `Watching ${describeAlert(alert)}`,
          widget: W.card(
            [
              W.rows([
                { label: "Watching", value: describeAlert(alert) },
                { label: "Right now", value: formatPrice(price) },
              ]),
              W.text("I will say so in the Markets chat. Nothing leaves this device."),
            ],
            { title: "Alert set", icon: "notifications-outline" },
          ),
        });
        return { type: "handled" };
      },
    },

    {
      name: "alerts",
      showIn: ["channel"],
      description: "The price alerts you have set",
      usage: "/alerts",
      async run({ respond }) {
        await respond(await views.alerts());
        return { type: "handled" };
      },
    },

    {
      name: "unalert",
      showIn: ["channel"],
      description: "Remove a price alert",
      usage: "/unalert <number | market>",
      async run({ args }) {
        const alerts = await readAlerts(context);
        const [target] = args;
        if (!target) return { type: "error", message: "Which one? /alerts lists them by number." };

        const index = Number(target) - 1;
        const remaining = Number.isInteger(index)
          ? alerts.filter((_, i) => i !== index)
          : alerts.filter((a) => a.symbol !== normaliseSymbol(target));

        if (remaining.length === alerts.length) {
          return { type: "error", message: `No alert matches "${target}". See /alerts.` };
        }

        const gone = alerts.length - remaining.length;
        await writeAlerts(context, remaining);
        return {
          type: "notice",
          tone: "success",
          message: `Removed ${gone} alert${gone === 1 ? "" : "s"}`,
        };
      },
    },

    {
      name: "marketapi",
      showIn: ["channel"],
      description: "Point price lookups at a different venue, or at Chainlink's feeds",
      usage: "/marketapi <url | chainlink | reset>",
      async run({ args, respond }) {
        const [value] = args;

        if (!value) {
          await respond(await views.marketapi());
          return { type: "handled" };
        }

        if (value.toLowerCase() === CHAINLINK) {
          await saveApiBase(context, CHAINLINK);
          return {
            type: "notice",
            tone: "success",
            message: "Prices come from Chainlink's feeds on Ethereum now, read through your Ethereum endpoint",
          };
        }

        if (value === "reset") {
          await saveApiBase(context, null);
          return {
            type: "notice",
            tone: "success",
            message: `Back on the default market API, ${DEFAULT_API_BASE}`,
          };
        }

        if (!/^https:\/\//i.test(value)) {
          return { type: "error", message: "The endpoint must start with https://." };
        }

        await saveApiBase(context, value.replace(/\/$/, ""));
        return { type: "notice", tone: "success", message: `Prices come from ${value} now` };
      },
    },
  ];
}

export function marketApiCard() {
  if (priceSource() === chainlink) {
    return {
      kind: "widget" as const,
      fallback: "Market data: Chainlink feeds on Ethereum",
      widget: W.card(
        [
          W.rows([{ label: "Now using", value: "Chainlink feeds on Ethereum" }]),
          W.text(
            `Prices are read from Chainlink's US dollar feeds through your Ethereum endpoint, so no exchange ` +
              `learns which markets you watch. Feeds: ${Object.keys(CHAINLINK_FEEDS).join(", ")}. A feed is ` +
              "written when the price moves past a threshold or a set time passes, so it can lag an exchange. " +
              "/marketapi reset goes back to the exchange.",
          ),
        ],
        { title: "Market data", icon: "server-outline" },
      ),
    };
  }
  return {
    kind: "widget" as const,
    fallback: `Market data: ${apiBase()}`,
    widget: W.card(
      [
        W.code(apiBase(), {
          label: isDefaultApiBase(apiBase()) ? "Now using (default)" : "Now using",
        }),
        W.text(
          "Any host exposing a Binance-compatible /ticker/24hr works. No API key is " +
            "used or stored. Change it with /marketapi https://your-host/api/v3, read Chainlink's " +
            "feeds on Ethereum with /marketapi chainlink, or go back with /marketapi reset.",
        ),
      ],
      { title: "Market data", icon: "server-outline" },
    ),
  };
}
