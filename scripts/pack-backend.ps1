$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path "$PSScriptRoot\.."
$backendDir = Join-Path $repoRoot 'backend'
$venv311Python = Join-Path $repoRoot '.venv311\Scripts\python.exe'
$venvPython = Join-Path $repoRoot '.venv\Scripts\python.exe'

if (Test-Path $venv311Python) {
  $pythonExe = $venv311Python
} elseif (Test-Path $venvPython) {
  $pythonExe = $venvPython
} else {
  throw 'No local virtual environment found. Create .venv311 or .venv first.'
}

Write-Host "Using Python: $pythonExe"

& $pythonExe -m pip install --upgrade pip
& $pythonExe -m pip install pyinstaller

$distPath = Join-Path $backendDir 'dist'
$workPath = Join-Path $backendDir 'build'
$specPath = Join-Path $backendDir 'build'
$entryPoint = Join-Path $backendDir 'iris_backend\main.py'

& $pythonExe -m PyInstaller `
  --noconfirm `
  --clean `
  --onedir `
  --name iris-backend `
  --distpath $distPath `
  --workpath $workPath `
  --specpath $specPath `
  --collect-submodules mediapipe `
  --collect-data mediapipe `
  $entryPoint

Write-Host 'Backend executable generated at backend/dist/iris-backend/'
