import { app, BrowserWindow, ipcMain, WebContentsView } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildSnapshot,
  clickNode,
  fillNode,
  scrollPage,
  evaluateExpression,
} from '../../dist/index.js';
import {
  clipRectToWindowContent,
  createBrowserSurface,
} from '../../dist/electron/index.js';
import {
  buildRefreshDependencies,
  discoverRefreshDependencies,
  replaceStylesheet,
  selectRefreshPlan,
} from '../../dist/refresh/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, 'fixtures');
const pageUrl = pathToFileURL(join(fixtureDir, 'demo.html')).href;
const cssPath = join(fixtureDir, 'demo.css');
const cssColors = ['#a63257', '#2457a6', '#22734f', '#7b4ca8'];
let colorIndex = 0;
let mainWindow;
let surface;
let surfaceVisible = false;
let overlayOpen = false;

const sendLog = (message) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('demo:log', message);
  }
};

const applySurface = () => {
  if (!mainWindow || !surface || mainWindow.isDestroyed()) return;
  const rect = surfaceRect;
  const clipped = rect ? clipRectToWindowContent(mainWindow, rect) : undefined;
  if (!clipped) {
    surface.setVisible(false);
    surfaceVisible = false;
    return;
  }
  surface.setBounds(clipped);
  const visible = !overlayOpen && mainWindow.isVisible() && !mainWindow.isMinimized();
  surface.setVisible(visible);
  surfaceVisible = visible;
};

let surfaceRect;

const navigate = async (url) => {
  if (!surface) throw new Error('surface is not ready');
  await surface.webContents.loadURL(url);
  sendLog(`navigated to ${url}`);
  return `navigated to ${url}`;
};

const cdp = (method, params) => {
  if (!surface) throw new Error('surface is not ready');
  return surface.webContents.debugger.sendCommand(method, params);
};

const runAgent = async () => {
  if (!surface) throw new Error('surface is not ready');
  const contents = surface.webContents;
  await contents.loadURL(pageUrl);
  await new Promise((resolve) => {
    if (!contents.isLoading()) return resolve();
    contents.once('did-stop-loading', resolve);
  });

  const debuggerApi = contents.debugger;
  const attachedHere = !debuggerApi.isAttached();
  if (attachedHere) debuggerApi.attach('1.3');
  try {
    const { nodes } = await cdp('Accessibility.getFullAXTree');
    const snapshot = buildSnapshot({ nodes, url: contents.getURL(), title: contents.getTitle() });
    const refs = [...snapshot.refs.values()];
    const go = refs.find((ref) => ref.role === 'button' && ref.name.includes('Go'));
    const email = refs.find((ref) => ref.role === 'textbox' && ref.name.includes('Email'));
    if (!go || !email) throw new Error('demo page refs were not found');

    await clickNode(cdp, `@${go.ref}`, go.backendNodeId);
    await fillNode(cdp, `@${email.ref}`, email.backendNodeId, 'demo@example.com');
    await scrollPage(cdp, 'down', 300);
    const state = await evaluateExpression(cdp, 'window.__state()');
    sendLog('scripted agent: click, fill and scroll completed');
    return `scripted agent result: ${JSON.stringify(state)}`;
  } finally {
    if (attachedHere && debuggerApi.isAttached()) debuggerApi.detach();
  }
};

const updateCss = async () => {
  if (!surface) throw new Error('surface is not ready');
  colorIndex = (colorIndex + 1) % cssColors.length;
  const original = await readFile(cssPath, 'utf8');
  const next = original.replace(/--demo-color:\s*#[0-9a-f]+;/i, `--demo-color: ${cssColors[colorIndex]};`);
  if (next !== original) {
    await writeFile(cssPath, next, 'utf8');
  } else {
    const addition = `\n.demo-color { color: ${cssColors[colorIndex]}; }\n`;
    await writeFile(cssPath, `${original}${addition}`, 'utf8');
  }

  const executeJavaScript = (script) => surface.webContents.executeJavaScript(script);
  const discovery = await discoverRefreshDependencies(executeJavaScript);
  if (!discovery) return 'refresh discovery returned no document';
  const dependencies = buildRefreshDependencies(discovery, pageUrl);
  const path = cssPath;
  const plan = selectRefreshPlan({
    pendingReload: false,
    pendingStyles: new Set(dependencies.has(path) ? [path] : []),
    dependencies,
  });
  if (plan.kind === 'css') {
    const dependency = dependencies.get(path);
    if (!dependency) return 'stylesheet dependency disappeared';
    await replaceStylesheet(executeJavaScript, { url: dependency.url });
    sendLog('CSS refresh used the partial stylesheet fast path');
    return 'CSS updated with the partial stylesheet fast path; document was not reloaded';
  }
  await surface.webContents.reload();
  sendLog('refresh plan required a full reload');
  return 'CSS updated with a full page reload';
};

const createWindow = async () => {
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#101722',
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow = window;
  await window.loadFile(join(here, 'host.html'));
  await window.webContents.executeJavaScript(
    `document.getElementById('url').value = ${JSON.stringify(pageUrl)}`,
  );

  surface = createBrowserSurface({
    window,
    viewConstructor: WebContentsView,
    partition: 'persist:electron-browser-surface-demo',
    visible: false,
  });
  await navigate(pageUrl);
  await window.webContents.executeJavaScript('window.__reportSurface?.()');
  surface.webContents.on('did-finish-load', () => sendLog('surface document loaded'));
  surface.webContents.on('render-process-gone', (_event, details) => {
    sendLog(`surface render process gone: ${JSON.stringify(details)}`);
  });
  window.on('resize', applySurface);
  window.on('minimize', applySurface);
  window.on('restore', applySurface);
  window.on('show', applySurface);
  window.on('hide', applySurface);
  window.on('closed', () => {
    mainWindow = undefined;
    surface = undefined;
  });
};

ipcMain.on('demo:surface', (_event, rect) => {
  surfaceRect = rect;
  applySurface();
});

ipcMain.handle('demo:navigate', async (_event, url) => {
  if (typeof url !== 'string' || url.length === 0) return 'invalid URL';
  return navigate(url);
});

ipcMain.handle('demo:run-agent', async () => {
  try {
    return await runAgent();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendLog(`scripted agent failed: ${message}`);
    return `scripted agent failed: ${message}`;
  }
});

ipcMain.handle('demo:update-css', async () => {
  try {
    return await updateCss();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendLog(`CSS refresh failed: ${message}`);
    return `CSS refresh failed: ${message}`;
  }
});

ipcMain.handle('demo:reload', async () => {
  if (!surface) return 'surface is not ready';
  surface.webContents.reload();
  sendLog('explicit full reload requested');
  return 'reloaded';
});

ipcMain.handle('demo:toggle-overlay', () => {
  overlayOpen = !overlayOpen;
  applySurface();
  return overlayOpen;
});

app.whenReady().then(async () => {
  await mkdir(fixtureDir, { recursive: true });
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (surface) void surface.destroy();
});
