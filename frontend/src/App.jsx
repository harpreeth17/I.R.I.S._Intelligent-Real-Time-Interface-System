import { useCallback, useMemo, useState } from 'react';
import GazeCursor from '@/components/GazeCursor';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { useBackendSocket } from '@/hooks/useBackendSocket';
import AppLauncherScreen from '@/screens/AppLauncherScreen';
import CalibrationScreen from '@/screens/CalibrationScreen';
import DashboardScreen from '@/screens/DashboardScreen';
import GazeKeyboardScreen from '@/screens/GazeKeyboardScreen';
import SettingsScreen from '@/screens/SettingsScreen';

const defaultStatus = {
  webcamConnected: false,
  calibrated: false,
  fps: 0,
  latencyMs: 0,
  error: null,
  demoMode: false,
  activeProfile: null,
  screenWidth: window.screen.width,
  screenHeight: window.screen.height,
};

const defaultSettings = {
  dwellDuration: 0.8,
  dwellRadius: 50,
  clickCooldown: 1.0,
  uiDwellDuration: 0.9,
  uiRepeatCooldown: 1.1,
  blinkClickEnabled: true,
  blinkThreshold: 0.2,
  blinkMinDuration: 0.15,
  cursorScaleX: 1.15,
  cursorScaleY: 1.15,
  cursorGainLeft: 0.9,
  cursorGainRight: 1.35,
  cursorGainUp: 1.5,
  cursorGainDown: 1.35,
  cursorYAxisSensitivity: 2.35,
  irisMotionScaleX: 1.45,
  irisMotionScaleY: 2.2,
  invertXAxis: false,
  invertYAxis: false,
  maxCursorSpeed: 1600,
  cursorSpeedMultiplier: 0.5,
  irisSmoothingAlpha: 0.28,
  cursorOffsetX: 0,
  cursorOffsetY: 0,
  calibrationSettleTime: 0.45,
  webcamMode: 'auto',
  demoMode: false,
};

export default function App() {
  const [screen, setScreen] = useState('dashboard');
  const [cursor, setCursor] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [dwellProgress, setDwellProgress] = useState(0);
  const [status, setStatus] = useState(defaultStatus);
  const [settings, setSettings] = useState(defaultSettings);
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  const [calibration, setCalibration] = useState({ active: false, targets: [], progress: 0, result: null });
  const [telemetry, setTelemetry] = useState({ previewFrame: null, rawIris: null, predictedRaw: null, ear: null });
  const [keyboardText, setKeyboardText] = useState('');

  const onEvent = useCallback((payload) => {
    if (payload.type === 'telemetry') {
      setCursor(payload.cursor || { x: 0, y: 0 });
      setDwellProgress(payload.dwellProgress || 0);
      setStatus((prev) => ({ ...prev, ...(payload.status || {}) }));
      setTelemetry({
        previewFrame: payload.previewFrame ?? null,
        rawIris: payload.rawIris ?? null,
        predictedRaw: payload.predictedRaw ?? null,
        ear: payload.ear ?? null,
      });
      if (payload.calibration) {
        setCalibration(payload.calibration);
      }
    }

    if (payload.type === 'hello' || payload.type === 'state') {
      if (payload.settings) setSettings((prev) => ({ ...prev, ...payload.settings }));
      if (payload.profiles) setProfiles(payload.profiles);
      if (payload.activeProfile !== undefined) setActiveProfile(payload.activeProfile);
      if (payload.calibration) setCalibration(payload.calibration);
    }

    if (payload.type === 'settings') {
      setSettings((prev) => ({ ...prev, ...payload.settings }));
    }

    if (payload.type === 'profiles') {
      if (payload.profiles) setProfiles(payload.profiles);
      if (payload.activeProfile !== undefined) setActiveProfile(payload.activeProfile);
    }

    if (payload.type === 'calibration_state') {
      setCalibration(payload);
    }
  }, []);

  const { connected, send } = useBackendSocket(onEvent);

  const modeLabel = useMemo(() => {
    switch (screen) {
      case 'calibration':
        return 'Calibration';
      case 'keyboard':
        return 'Typing';
      case 'launcher':
        return 'Launcher';
      case 'settings':
        return 'Settings';
      default:
        return 'Monitoring';
    }
  }, [screen]);

  const onSettingsChange = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    send({ type: 'update_settings', settings: patch });
  };

  const currentScreen = (() => {
    if (screen === 'calibration') {
      return <CalibrationScreen calibration={calibration} send={send} connected={connected} />;
    }
    if (screen === 'keyboard') {
      return (
        <GazeKeyboardScreen
          dwellDuration={settings.uiDwellDuration ?? settings.dwellDuration}
          repeatCooldown={settings.uiRepeatCooldown ?? 1.1}
          text={keyboardText}
          setText={setKeyboardText}
        />
      );
    }
    if (screen === 'launcher') {
      return <AppLauncherScreen settings={settings} />;
    }
    if (screen === 'settings') {
      return (
        <SettingsScreen
          settings={settings}
          onSettingsChange={onSettingsChange}
          profiles={profiles}
          activeProfile={activeProfile}
          onLoadProfile={(name) => send({ type: 'load_profile', name })}
          send={send}
        />
      );
    }

    return <DashboardScreen cursor={cursor} status={status} dwellProgress={dwellProgress} telemetry={telemetry} />;
  })();

  const displayCursor = useMemo(() => {
    const backendW = Number(status?.screenWidth || window.screen.width);
    const backendH = Number(status?.screenHeight || window.screen.height);
    const cssW = window.screen.width;
    const cssH = window.screen.height;

    return {
      x: (cursor.x / Math.max(1, backendW)) * cssW,
      y: (cursor.y / Math.max(1, backendH)) * cssH,
    };
  }, [cursor, status]);

  return (
    <div className="h-screen bg-irisBg text-slate-100">
      <TopBar status={status} connected={connected} modeLabel={modeLabel} />
      <div className="flex h-[calc(100vh-4rem)]">
        <Sidebar active={screen} onChange={setScreen} />
        <main className="flex-1 overflow-auto p-6">{currentScreen}</main>
      </div>
      <GazeCursor x={displayCursor.x} y={displayCursor.y} />
    </div>
  );
}
