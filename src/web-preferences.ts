/**
 * Secure defaults for the native WebContentsView carrier. Keep this object
 * Electron-free so the core package can be imported outside Electron.
 */
export const BROWSER_SECURE_WEB_PREFERENCES = {
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webviewTag: false,
  backgroundThrottling: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
} as const
