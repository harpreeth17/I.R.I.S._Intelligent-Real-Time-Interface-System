# I.R.I.S - Gaze-Controlled Accessibility Prototype

I.R.I.S is a desktop prototype for motor-impaired users that combines:
- Python gaze tracking backend (MediaPipe + OpenCV + scikit-learn + PyAutoGUI)
- Electron + React desktop UI frontend
- Local WebSocket transport (`ws://localhost:8765`)

## Features

### Backend (Python)
- MediaPipe Face Mesh tracking with iris landmarks (`468`, `473`) at a 30 FPS target.
- Iris normalization using eye corner landmarks (`33`, `133`, `362`, `263`) plus eye-height stabilization.
- 9-point calibration workflow (`3x3`, `1.5s` per point).
- Degree-2 polynomial regression mapping for X and Y screen coordinates.
- Kalman smoothing with state vector `[x, y, vx, vy]`.
- Dwell click: radius `50px`, duration `0.8s`, cooldown `1.0s`.
- Blink click: EAR threshold `< 0.20` for at least `150ms`.
- OS-level cursor movement and click via PyAutoGUI.
- Profile model save/load via pickle, with profile metadata/settings in JSON.
- Demo mode using mouse position when no webcam is available.

### Frontend (Electron + React)
- Dark navy and teal theme (`#0a0f1e`, `#4fc3f7`, `#90caf9`).
- Persistent sidebar navigation and top health bar.
- Screen 1: Dashboard
- Screen 2: Calibration screen with sequential target visuals and progress ring
- Screen 3: Gaze keyboard with dwell typing, predictions, and speech synthesis
- Screen 4: App launcher
- Screen 5: Dedicated settings screen for gaze, blink, dwell, and profile controls

## Project Layout

```text
IRIS/
  backend/
    iris_backend/
      main.py
      calibration.py
      kalman.py
      blink.py
      storage.py
      config.py
    profiles/
      profiles.json
    requirements.txt
  frontend/
    electron/
      main.cjs
      preload.cjs
    src/
      components/
      screens/
      hooks/
      utils/
      App.jsx
      main.jsx
      index.css
    package.json
    vite.config.js
    tailwind.config.js
  scripts/
    start.ps1
  package.json
  README.md
```

## Prerequisites

- Windows 10/11
- Python 3.10-3.12 recommended for webcam Face Mesh mode
- Node.js 18+
- npm

## Setup

1. Install frontend dependencies:

```powershell
npm --prefix frontend install
```

2. Install Python dependencies:

```powershell
pip install -r backend/requirements.txt
```

Note: On Python 3.14, MediaPipe may not expose the legacy `solutions.face_mesh` API used by this prototype.
In that case the backend starts in Demo mode and webcam calibration is disabled. For full webcam tracking,
use Python 3.10-3.12.

If your environment requires a specific Python executable, set it before launch:

```powershell
$env:IRIS_PYTHON = "C:\path\to\python.exe"
```

## Run (Single Command)

From the repository root:

```powershell
npm run dev
```

This starts Electron + React, and Electron launches the Python backend subprocess automatically.

If PowerShell blocks npm scripts:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
npm.cmd run dev
```

## Usage Notes

- If webcam is unavailable, open the `Settings` screen and enable `Demo mode`.
- Run calibration from the Calibration screen, then save a named profile.
- Load profiles from the Settings screen.
- The top bar shows webcam, calibration, FPS, latency, and socket health.

### Cursor Tuning Tips

- If gaze moves too much to the left, increase `Right axis gain` and/or reduce `Left axis gain`.
- If motion is wavy, reduce `Max cursor speed` and lower `Iris smoothing alpha`.
- If the cursor drifts upward, reduce `Up axis gain` or add positive `Cursor offset Y`.
- Re-run 9-point calibration after major tuning changes.

## Build Installers

This project includes packaging scripts to distribute IRIS as an installable desktop app.

1. Build backend executable:

```powershell
npm run pack:backend
```

2. Build Windows website installer (`.exe` via NSIS):

```powershell
npm run pack:win
```

3. Build Microsoft Store-ready package (`.appx`):

```powershell
npm run pack:store
```

Artifacts are written under `frontend/release/`.

Note: For Store submission, replace placeholder `appx` identity/publisher values in `frontend/package.json` with your official Partner Center values and sign the package with the correct certificate.

## Troubleshooting

- If WebSocket is disconnected, ensure backend started successfully from Electron logs.
- If cursor movement is blocked, verify OS permissions for accessibility/mouse control.
- If MediaPipe camera access fails, close other apps using the webcam and retry.
