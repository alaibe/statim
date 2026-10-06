import { router } from 'expo-router';
import { useEffect } from 'react';

/** Where a Trezor Suite answer lands once `+native-intent` has handed it on. */
export default function TrezorAnswered() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);
  return null;
}
