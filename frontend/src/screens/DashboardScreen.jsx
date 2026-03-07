import DwellRing from '@/components/DwellRing';

export default function DashboardScreen({ cursor, status, dwellProgress }) {
  const previewWidth = 420;
  const previewHeight = 240;
  const screenW = status?.screenWidth || window.screen.width;
  const screenH = status?.screenHeight || window.screen.height;

  const previewX = (cursor.x / screenW) * previewWidth;
  const previewY = (cursor.y / screenH) * previewHeight;

  return (
    <section className="grid h-full grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
      <div className="rounded-3xl border border-sky-300/20 bg-[#111b33] p-6 shadow-xl">
        <h2 className="text-xl font-semibold text-sky-100">Live Gaze Preview</h2>
        <p className="mb-6 text-sm text-slate-300">Animated cursor projection and real-time tracking telemetry.</p>

        <div
          className="relative overflow-hidden rounded-2xl border border-sky-300/20 bg-gradient-to-br from-[#0f1b36] to-[#0b1226]"
          style={{ width: previewWidth, height: previewHeight }}
        >
          <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,rgba(79,195,247,0.25),transparent_45%)]" />
          <div
            className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300 shadow-[0_0_20px_rgba(79,195,247,0.9)] transition-all duration-75"
            style={{ left: previewX, top: previewY }}
          />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div className="rounded-xl bg-[#0c152b] p-3 text-slate-300">X: {Math.round(cursor.x)}</div>
          <div className="rounded-xl bg-[#0c152b] p-3 text-slate-300">Y: {Math.round(cursor.y)}</div>
          <div className="rounded-xl bg-[#0c152b] p-3 text-slate-300">EAR: {status?.blinkEAR ?? '-'}</div>
          <div className="rounded-xl bg-[#0c152b] p-3 text-slate-300">
            Face: {status?.faceFound ? 'Detected' : 'Not found'}
          </div>
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
