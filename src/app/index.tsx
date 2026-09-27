import { Redirect } from 'expo-router';

import { Loading } from '@/design';
import { useIdentityStore } from '@/core/identity/identity-store';

export default function Index() {
  const status = useIdentityStore((s) => s.status);

  if (status === 'ready') return <Redirect href="/chats" />;

  if (status === 'invalidated') return <Redirect href="/recover" />;

  if (status === 'loading' || status === 'blocked' || status === 'error') {
    return <Loading className="flex-1 bg-canvas" />;
  }

  return <Redirect href="/(onboarding)/welcome" />;
}
