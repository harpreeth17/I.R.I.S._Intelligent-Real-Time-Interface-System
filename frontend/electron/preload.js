import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('irisAPI', {
  launchApp: (appKey) => ipcRenderer.invoke('launch-app', appKey)
});
