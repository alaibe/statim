import { useEffect, useState } from "react";

import { reportError } from "@/core/app/report-error";
import { PLATFORM_NAME } from "@/lib/platform-name";

/** On Linux an `asset://` file loads from a blob; null until it has loaded. */
export function useLoadableUri(uri: string): string | null {
  const viaBlob = PLATFORM_NAME === "Linux" && uri.startsWith("asset:");
  const [loaded, setLoaded] = useState<{ from: string; blob: string } | null>(null);

  useEffect(() => {
    if (!viaBlob) return;
    let blobUri: string | null = null;
    let cancelled = false;
    fetch(uri)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load ${uri}: ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        blobUri = URL.createObjectURL(blob);
        setLoaded({ from: uri, blob: blobUri });
      })
      .catch(reportError);
    return () => {
      cancelled = true;
      if (blobUri) URL.revokeObjectURL(blobUri);
    };
  }, [uri, viaBlob]);

  if (!viaBlob) return uri;
  return loaded?.from === uri ? loaded.blob : null;
}
