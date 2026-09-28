import { useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/core/errors';
import type { BridgeProvisioning, LoginStep, Whoami } from '@/protocols/matrix/provisioning';

type BridgeLoginPhase = 'loading' | 'unavailable' | 'flows' | 'step' | 'done';

/** A bridge's sign-in, one provisioning step at a time; an open step is cancelled on leaving or starting over. */
export function useBridgeLogin(provisioning: BridgeProvisioning | null) {
  const [whoami, setWhoami] = useState<Whoami | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [step, setStep] = useState<LoginStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef<LoginStep | null>(null);

  useEffect(() => {
    if (!provisioning) return;
    let cancelled = false;
    provisioning
      .whoami()
      .then((result) => {
        if (!cancelled) setWhoami(result);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [provisioning]);

  useEffect(
    () => () => {
      if (live.current && provisioning) provisioning.cancel(live.current).catch(() => {});
    },
    [provisioning]
  );

  async function advance(next: Promise<LoginStep>) {
    setBusy(true);
    setError(null);
    let result: LoginStep | null = null;
    try {
      result = await next;
    } catch (e) {
      setError(errorMessage(e, 'The bridge did not accept that'));
    }
    setBusy(false);
    if (!result) return;
    live.current = result.type === 'complete' ? null : result;
    setStep(result);
  }

  useEffect(() => {
    if (!provisioning || step?.type !== 'display_and_wait') return;
    let cancelled = false;
    provisioning
      .wait(step)
      .then((next) => {
        if (!cancelled) void advance(Promise.resolve(next));
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e, 'The sign-in stopped'));
      });
    return () => {
      cancelled = true;
    };
  }, [provisioning, step]);

  const phase: BridgeLoginPhase =
    !provisioning || unavailable
      ? 'unavailable'
      : !whoami
        ? 'loading'
        : !step
          ? 'flows'
          : step.type === 'complete'
            ? 'done'
            : 'step';

  return {
    phase,
    whoami,
    step,
    error,
    busy,
    start(flowId: string) {
      if (provisioning) void advance(provisioning.start(flowId));
    },
    submit(values: Record<string, string>) {
      if (provisioning && step) void advance(provisioning.submit(step, values));
    },
    restart() {
      if (live.current && provisioning) provisioning.cancel(live.current).catch(() => {});
      live.current = null;
      setStep(null);
      setError(null);
    },
  };
}
