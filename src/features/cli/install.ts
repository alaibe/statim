export interface CliInstall {
  installed: boolean;
  command: string | null;
  path: string | null;
}

export async function cliInstall(): Promise<CliInstall | null> {
  return null;
}

/** False when the person cancels the administrator prompt. */
export async function cliLink(): Promise<boolean> {
  return false;
}
