export default function TopBar({ status, connected, modeLabel }) {
  const healthItems = [
    {
      label: 'Webcam',
      value: status?.demoMode ? 'Demo' : status?.webcamConnected ? 'Connected' : 'Offline',
      good: status?.demoMode || status?.webcamConnected,
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
        <h1 className="text-lg font-semibold tracking-wide text-sky-100">I.R.I.S</h1>
        <p className="text-xs text-slate-300">Intelligent Responsive Interface System</p>
      </div>

      <div className="flex items-center gap-3">
        {healthItems.map((item) => (
          <div
            key={item.label}
            className={`rounded-xl border px-3 py-1 text-xs ${
              item.good
                ? 'border-teal-300/30 bg-teal-300/10 text-teal-100'
                : 'border-rose-300/30 bg-rose-300/10 text-rose-100'
            }`}
          >
            <span className="mr-2 text-slate-300">{item.label}:</span>
            <span>{item.value}</span>
          </div>
        ))}
        <div className="rounded-xl border border-sky-300/30 bg-sky-300/10 px-3 py-1 text-xs text-sky-100">
          Mode: {modeLabel}
        </div>
      </div>
    </header>
  );
}
