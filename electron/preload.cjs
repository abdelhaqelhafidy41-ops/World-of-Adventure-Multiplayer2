const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  isDesktop: true,
  platform: process.platform,
  toggleFullscreen: () => ipcRenderer.invoke('desktop:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('desktop:is-fullscreen'),
  quitApp: () => ipcRenderer.invoke('desktop:quit-app'),
});
