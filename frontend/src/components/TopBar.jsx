import { getCameraStatus } from '@/components/CameraStatus';

export default function TopBar({ status, connected, modeLabel }) {
  const camera = getCameraStatus(status);
  const healthItems = [
    {
      label: 'Webcam',
      value: camera.label,
      good:
        status?.cameraStatus === 'connected' ||
        (!status?.cameraStatus && status?.webcamConnected) ||
        (status?.demoMode && status?.cameraStatus !== 'mediapipe_error'),
    },
    {
      label: 'Calibration',
      value: status?.calibrated ? 'Ready' : 'Not Calibrated',
      good: status?.calibrated,
    },
    {
      label: 'FPS',
      value: `${status?.fps ?? 0}`,
      good: (status?.fps ?? 0) >= 20,
    },
    {
      label: 'Latency',
      value: `${status?.latencyMs ?? 0} ms`,
      good: (status?.latencyMs ?? 999) < 80,
    },
    {
      label: 'Socket',
      value: connected ? 'Live' : 'Disconnected',
      good: connected,
    },
  ];

  return (
    <header className="flex h-16 items-center justify-between border-b border-sky-300/20 bg-[#0d172d]/90 px-6 backdrop-blur">
      <div>
        <h1 className="iris-section-heading font-semibold tracking-wide text-sky-100">I.R.I.S</h1>
        <p className="iris-supporting text-slate-300">Intelligent Responsive Interface System</p>
      </div>

      <div className="flex items-center gap-3">
        {healthItems.map((item) => (
          <div
            key={item.label}
            className={`iris-status rounded-xl border px-3 py-1 ${
              item.good
                ? 'border-teal-300/30 bg-teal-300/10 text-teal-100'
                : 'border-rose-300/30 bg-rose-300/10 text-rose-100'
            }`}
          >
            <span className="mr-2 text-slate-300">{item.label}:</span>
            <span>{item.value}</span>
          </div>
        ))}
        <div className="iris-status rounded-xl border border-sky-300/30 bg-sky-300/10 px-3 py-1 text-sky-100">
          Mode: {modeLabel}
        </div>
      </div>
    </header>
  );
}
