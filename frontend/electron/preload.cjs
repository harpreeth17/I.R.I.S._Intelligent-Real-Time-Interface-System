const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('irisAPI', {
  launchApp: (appKey) => ipcRenderer.invoke('launch-app', appKey)
});
