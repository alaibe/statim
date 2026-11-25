import { createContext, useContext, useEffect, useId, useState } from "react";

interface Claims {
  claim(id: string): () => void;
}

const PrimaryContext = createContext<Claims | null>(null);

export class TwoPrimaries extends Error {
  constructor() {
    super("Two primary buttons on one screen: the button page allows one. Make the other secondary.");
  }
}

/** A screen, a dialog or a sheet: at most one primary button inside it. */
export function PrimaryScope({ children }: { children: React.ReactNode }) {
  const [claims] = useState<Claims>(() => {
    const claimed = new Set<string>();
    return {
      claim(id) {
        claimed.add(id);
        if (claimed.size > 1) reportTwoPrimaries();
        return () => claimed.delete(id);
      },
    };
  });
  return <PrimaryContext.Provider value={claims}>{children}</PrimaryContext.Provider>;
}

function reportTwoPrimaries() {
  if (process.env.NODE_ENV === "production") return;
  console.error(new TwoPrimaries().message);
}

/** A primary button registers with its screen while it is shown. */
export function usePrimaryClaim(primary: boolean) {
  const scope = useContext(PrimaryContext);
  const id = useId();
  useEffect(() => (primary && scope ? scope.claim(id) : undefined), [primary, scope, id]);
}
