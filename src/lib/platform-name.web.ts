// The web view reports a frozen system version, so only the system's name is known here.
export const PLATFORM_NAME = /Mac/.test(navigator.userAgent)
  ? 'macOS'
  : /Windows/.test(navigator.userAgent)
    ? 'Windows'
    : 'Linux';
