import { useState } from 'react';
import DwellRing from '@/components/DwellRing';

export default function CalibrationScreen({ calibration, send, connected, onBack }) {
  const [profileName, setProfileName] = useState('default');

  const active = calibration?.active;
  const targets = calibration?.targets || [];
  const currentIndex = calibration?.targetIndex ?? -1;
  const result = calibration?.result;

  return (
    <section className="relative h-full overflow-hidden rounded-3xl border border-sky-300/20 bg-[#0b1226] p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-sky-100">24-Point Calibration</h2>
          <p className="text-sm text-slate-300">Focus on each glowing target for 1.5 seconds to map iris vectors to screen coordinates.</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              if (active) send({ type: 'cancel_calibration' });
              onBack();
            }}
            className="min-h-[80px] min-w-[120px] rounded-2xl border border-slate-300/40 bg-slate-400/10 px-4 text-slate-100"
          >
            Return to Dashboard
          </button>
          <button
            type="button"
            onClick={() => send({ type: 'start_calibration' })}
            disabled={!connected}
            className="min-h-[80px] min-w-[120px] rounded-2xl border border-sky-300/40 bg-sky-400/20 px-4 text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start
          </button>
          <button
            type="button"
            onClick={() => send({ type: 'cancel_calibration' })}
            disabled={!connected}
            className="min-h-[80px] min-w-[120px] rounded-2xl border border-rose-300/40 bg-rose-400/20 px-4 text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>

      {!connected && (
        <div className="mb-4 rounded-2xl border border-rose-300/30 bg-rose-400/10 p-3 text-sm text-rose-100">
          Backend disconnected. Calibration controls require the Python gaze service to be running.
        </div>
      )}

      <div className="relative mx-auto mt-4 h-[68vh] w-full rounded-2xl border border-sky-300/20 bg-[#0a0f1e]">
        {targets.map((point, index) => {
          const left = (point[0] / window.screen.width) * 100;
          const top = (point[1] / window.screen.height) * 100;
          const isActive = active && currentIndex === index;

          return (
            <div
              key={`${point[0]}-${point[1]}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ${
                isActive ? 'scale-110 opacity-100' : 'scale-90 opacity-45'
              }`}
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              <div className={`relative flex h-16 w-16 items-center justify-center rounded-full ${isActive ? 'animate-pulseGlow' : ''}`}>
                <div className="absolute h-16 w-16 rounded-full bg-sky-300/30 blur-md" />
                <div className="relative h-8 w-8 rounded-full border border-sky-100 bg-sky-300 shadow-glow" />
                {isActive && (
                  <div className="absolute">
                    <DwellRing progress={calibration?.progress ?? 0} size={72} stroke={5} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {result?.ok && (
        <div className="mt-6 rounded-2xl border border-teal-300/30 bg-teal-300/10 p-4 text-teal-100">
          <p className="text-lg">Calibration complete. Accuracy: {result.accuracy}% (RMSE {result.rmse})</p>
          <div className="mt-3 flex gap-3">
            <input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="min-h-[56px] w-64 rounded-xl border border-sky-300/30 bg-[#0b1834] px-3 text-slate-100"
              placeholder="Profile name"
            />
            <button
              type="button"
              className="min-h-[80px] min-w-[120px] rounded-2xl border border-sky-300/40 bg-sky-400/20 px-4 text-sky-100"
              onClick={() => send({ type: 'save_profile', name: profileName })}
            >
              Save Profile
            </button>
          </div>
        </div>
      )}

      {result && result.ok === false && (
        <div className="mt-6 rounded-2xl border border-rose-300/30 bg-rose-400/10 p-4 text-rose-100">
          {result.message || 'Calibration failed. Please try again.'}
        </div>
      )}
    </section>
  );
}
