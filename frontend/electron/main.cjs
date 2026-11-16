const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');

const isDev = !app.isPackaged;

let mainWindow;
let pythonProcess;
let calibrationWindowState = null;

function waitForBackend(port, host = '127.0.0.1', timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const tryConnect = () => {
      const socket = net.connect(port, host);
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for backend on ${host}:${port}`));
        } else {
          setTimeout(tryConnect, 250);
        }
      });
    };

    tryConnect();
  });
}

const appCommands = {
  browser: 'start chrome',
  whatsapp: 'start "" https://web.whatsapp.com',
  chatgpt: 'start "" https://chatgpt.com',
  spotify: 'start "" https://open.spotify.com',
  youtube: 'start "" https://www.youtube.com',
  calendar: 'start "" https://calendar.google.com',
  windowsSettings: 'start ms-settings:',
  fileManager: 'explorer',
  calculator: 'start calc',
  notepad: 'start notepad',
  media: 'start "" vlc'
};

function startPythonBackend() {
  if (isDev) {
    const venv311Python = path.resolve(__dirname, '../../.venv311/Scripts/python.exe');
    const venvPython = path.resolve(__dirname, '../../.venv/Scripts/python.exe');
    const pythonCmd =
      process.env.IRIS_PYTHON ||
      (fs.existsSync(venv311Python)
        ? venv311Python
        : fs.existsSync(venvPython)
          ? venvPython
          : 'python');
    const backendEntry = path.resolve(__dirname, '../../backend/iris_backend/main.py');

    pythonProcess = spawn(pythonCmd, [backendEntry], {
      cwd: path.resolve(__dirname, '../../backend'),
      stdio: 'inherit',
      shell: false,
      windowsHide: true
    });
  } else {
    const bundledExeCandidates = [
      path.resolve(process.resourcesPath, 'backend/iris-backend/iris-backend.exe'),
      path.resolve(process.resourcesPath, 'backend/iris-backend.exe')
    ];
    const backendExe = bundledExeCandidates.find((candidate) => fs.existsSync(candidate));

    if (!backendExe) {
      console.error('Bundled backend executable was not found in resources.');
      return;
    }

    pythonProcess = spawn(backendExe, [], {
      cwd: path.dirname(backendExe),
      stdio: 'inherit',
      shell: false
    });
  }

  pythonProcess.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Python backend exited with code ${code}`);
    }
  });
}

function stopPythonBackend() {
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill();
  }
}

function enterCalibrationFullscreen() {
  if (!mainWindow) return;
  if (!calibrationWindowState) {
    calibrationWindowState = {
      bounds: mainWindow.getBounds(),
      maximized: mainWindow.isMaximized(),
      fullScreen: mainWindow.isFullScreen()
    };
  }
  mainWindow.setFullScreen(true);
}

function exitCalibrationFullscreen() {
  if (!mainWindow) return;
  const previousState = calibrationWindowState;
  calibrationWindowState = null;
  mainWindow.setFullScreen(false);
  if (!previousState) return;
  if (previousState.maximized) {
    mainWindow.maximize();
  } else {
    mainWindow.restore();
    mainWindow.setBounds(previousState.bounds);
  }
  if (previousState.fullScreen) mainWindow.setFullScreen(true);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#0a0f1e',
    webPreferences: {
      preload: path.resolve(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.resolve(__dirname, '../dist/index.html'));
  }
}

ipcMain.handle('launch-app', async (_, appKey) => {
  const command = appCommands[appKey];
  if (!command) {
    return { ok: false, error: 'Unknown application key' };
  }

  try {
    spawn(command, {
      shell: true,
      detached: true,
      stdio: 'ignore'
    }).unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('calibration-fullscreen', async (_, enabled) => {
  if (enabled) enterCalibrationFullscreen();
  else exitCalibrationFullscreen();
  return { ok: true };
});

app.whenReady().then(async () => {
  startPythonBackend();
  try {
    await waitForBackend(8765);
  } catch (error) {
    console.error(error.message);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopPythonBackend();
});
