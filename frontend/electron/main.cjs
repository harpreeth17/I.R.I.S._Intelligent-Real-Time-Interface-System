const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const isDev = !app.isPackaged;

let mainWindow;
let pythonProcess;

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
      shell: true
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

app.whenReady().then(() => {
  startPythonBackend();
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
