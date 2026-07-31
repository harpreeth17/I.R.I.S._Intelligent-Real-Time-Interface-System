import DwellRing from '@/components/DwellRing';

export default function DashboardScreen({ cursor, status, dwellProgress, telemetry }) {
  const previewWidth = 420;
  const previewHeight = 240;
  const screenW = status?.screenWidth || window.screen.width;
  const screenH = status?.screenHeight || window.screen.height;

  const previewSrc = telemetry?.previewFrame ? `data:image/jpeg;base64,${telemetry.previewFrame}` : null;

  return (
    <section className="grid h-full grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
      <div className="rounded-3xl border border-sky-300/20 bg-[#111b33] p-6 shadow-xl">
        <h2 className="text-xl font-semibold text-sky-100">Webcam Preview</h2>
        <p className="mb-6 text-sm text-slate-300">Live feed from the connected webcam with gaze telemetry beneath it.</p>

        <div
          className="relative overflow-hidden rounded-2xl border border-sky-300/20 bg-gradient-to-br from-[#0f1b36] to-[#0b1226]"
          style={{ width: previewWidth, height: previewHeight }}
        >
          {previewSrc ? (
            <img
              src={previewSrc}
              alt="Connected webcam preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Waiting for webcam frames...
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(7,12,24,0.08),rgba(7,12,24,0.42))]" />
          <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-cyan-300/30 bg-[#07111f]/70 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-cyan-100 backdrop-blur">
            Connected webcam
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div className="rounded-xl bg-[#0c152b] p-3 text-slate-300">X: {Math.round(cursor.x)}</div>
          <div className="rounded-xl bg-[#0c152b] p-3 text-slate-300">Y: {Math.round(cursor.y)}</div>
          <div className="rounded-xl bg-[#0c152b] p-3 text-slate-300">EAR: {status?.blinkEAR ?? '-'}</div>
          <div className="rounded-xl bg-[#0c152b] p-3 text-slate-300">
            Face: {status?.faceFound ? 'Detected' : 'Not found'}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-slate-300">
          <div className="rounded-xl bg-[#081028] p-2">Raw Iris: {telemetry?.rawIris ? telemetry.rawIris.map((v) => v.toFixed(3)).join(', ') : '-'}</div>
          <div className="rounded-xl bg-[#081028] p-2">Predicted Raw: {telemetry?.predictedRaw ? Math.round(telemetry.predictedRaw[0]) + ', ' + Math.round(telemetry.predictedRaw[1]) : '-'}</div>
          <div className="rounded-xl bg-[#081028] p-2">EAR (live): {telemetry?.ear ?? '-'}</div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-3xl border border-sky-300/20 bg-[#111b33] p-6">
          <h3 className="mb-4 text-lg text-sky-100">System Status</h3>
          <div className="space-y-3 text-sm">
            <p className="text-slate-300">Webcam: {status?.webcamConnected ? 'Connected' : status?.demoMode ? 'Demo mode' : 'Offline'}</p>
            <p className="text-slate-300">Calibration: {status?.calibrated ? 'Calibrated' : 'Needs calibration'}</p>
            <p className="text-slate-300">FPS: {status?.fps ?? 0}</p>
            <p className="text-slate-300">Latency: {status?.latencyMs ?? 0} ms</p>
            <p className="text-slate-300">Profile: {status?.activeProfile ?? 'None'}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-sky-300/20 bg-[#111b33] p-6">
          <h3 className="mb-4 text-lg text-sky-100">Dwell Click Progress</h3>
          <div className="flex items-center gap-4">
            <DwellRing progress={dwellProgress} size={92} stroke={8} />
            <p className="text-sm text-slate-300">The ring fills when gaze remains stable inside the configured dwell radius.</p>
          </div>
        </div>

        {status?.error && (
          <div className="rounded-2xl border border-rose-300/30 bg-rose-400/10 p-4 text-sm text-rose-100">
            {status.error}
          </div>
        )}
      </div>
    </section>
  );
}
