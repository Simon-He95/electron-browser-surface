const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('demo', {
  sendSurface(rect) {
    ipcRenderer.send('demo:surface', rect);
  },
  navigate(url) {
    return ipcRenderer.invoke('demo:navigate', url);
  },
  runAgent() {
    return ipcRenderer.invoke('demo:run-agent');
  },
  updateCss() {
    return ipcRenderer.invoke('demo:update-css');
  },
  reload() {
    return ipcRenderer.invoke('demo:reload');
  },
  toggleOverlay() {
    return ipcRenderer.invoke('demo:toggle-overlay');
  },
  onLog(listener) {
    const handler = (_event, entry) => listener(entry);
    ipcRenderer.on('demo:log', handler);
    return () => ipcRenderer.removeListener('demo:log', handler);
  },
});
