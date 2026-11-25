import { Redirect } from "expo-router";
import { useAccountStore } from "@/core/account/account-store";
import { Loading } from "@/design";

export default function Index() {
  const status = useAccountStore((s) => s.status);

  if (status === "ready") return <Redirect href="/chats" />;

  if (status === "invalidated") return <Redirect href="/recover" />;

  if (status === "loading" || status === "blocked" || status === "error") {
    return <Loading className="flex-1 bg-bg" />;
  }

  return <Redirect href="/(onboarding)/welcome" />;
}
