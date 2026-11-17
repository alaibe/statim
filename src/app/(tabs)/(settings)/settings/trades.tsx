import { View } from "react-native";
import { loadLcxKey, loadTradeKey, saveLcxKey, saveTradeKey } from "@/core/account/trade-key";
import { ApiKeySection } from "@/features/settings/api-key-screen";
import { SettingsScreen } from "@/features/settings/settings-screen";

export default function TradeSettingsScreen() {
  return (
    <SettingsScreen title="Trades">
      <ApiKeySection
        sectionTitle="LI.FI API key"
        testIdPrefix="trade-key"
        placeholder="Your LI.FI key"
        load={loadTradeKey}
        save={saveTradeKey}
        savedMessage="Trades use your LI.FI key"
        notes={[
          "/trade swaps and bridges through LI.FI, and works without a key: LI.FI allows this " +
            "device about 75 quotes every two hours, which is plenty for a personal wallet. A key " +
            "raises that to 100 a minute. No key ships with this app, and none is shared between " +
            "accounts.",
          "Quotes go straight from this device to LI.FI, so the address, tokens and amounts you " +
            "trade are visible to them. Nothing passes through this app. The trade itself is " +
            "signed here and sent to the chain like any other transaction.",
          "To get one, sign up at portal.li.fi, create an integrator and copy its API key.",
        ]}
        link={{ label: "Get a LI.FI key", url: "https://portal.li.fi/" }}
      />
      <View className="mt-8">
        <ApiKeySection
          sectionTitle="LCX Liberty DEX API key"
          testIdPrefix="lcx-key"
          placeholder="Your LCX Liberty DEX key"
          load={loadLcxKey}
          save={saveLcxKey}
          savedMessage="Swaps compare LI.FI and LCX Liberty DEX"
          notes={[
            "Optional, and off until you save a key. With one, a swap that stays on one chain also " +
              "asks LCX Liberty DEX for a quote and uses whichever guarantees you more of the token " +
              "you receive. Bridges still go through LI.FI. No key ships with this app, and none is " +
              "shared between accounts.",
            "Those quotes go straight from this device to LCX Liberty DEX, so the address, tokens " +
              "and amounts you trade are visible to them. Nothing passes through this app.",
            "To get one, sign in at dex.lcx.com with your email, open the dashboard and create a " +
              "key. The free plan allows 150,000 calls a month.",
          ]}
          link={{ label: "Get an LCX Liberty DEX key", url: "https://dex.lcx.com/dashboard" }}
        />
      </View>
    </SettingsScreen>
  );
}
