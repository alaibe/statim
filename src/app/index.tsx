import { Redirect } from "expo-router";
import { useAccountStore } from "@/core/account/account-store";
import { Splash } from "@/design";

export default function Index() {
  const status = useAccountStore((s) => s.status);

  if (status === "ready") return <Redirect href="/chats" />;

  if (status === "invalidated") return <Redirect href="/recover" />;

  if (status === "loading" || status === "blocked" || status === "error")
    return <Splash line="> opening the account…" />;

  return <Redirect href="/(onboarding)/welcome" />;
}
