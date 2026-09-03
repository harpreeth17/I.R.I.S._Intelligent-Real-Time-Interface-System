import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('irisAPI', {
  launchApp: (appKey) => ipcRenderer.invoke('launch-app', appKey),
  setCalibrationFullscreen: (enabled) => ipcRenderer.invoke('calibration-fullscreen', enabled)
});
