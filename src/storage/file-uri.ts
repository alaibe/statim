export function pathOfFileUri(uri: string): string {
  return decodeURI(uri.replace(/^file:\/\//, ""));
}
