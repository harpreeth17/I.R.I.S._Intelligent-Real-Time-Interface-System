import { useState } from 'react';
import DwellRing from '@/components/DwellRing';

export default function CalibrationScreen({ calibration, send, connected, onBack }) {
  const [profileName, setProfileName] = useState('default');

  const active = calibration?.active;
  const targets = calibration?.targets || [];
  const currentIndex = calibration?.targetIndex ?? -1;
  const result = calibration?.result;
  const phaseLabel =
    calibration?.phase === 'validation'
      ? 'Validation: look at each fresh target'
      : calibration?.phase === 'training'
        ? 'Calibration: look at each target'
        : '';

  return (
    <section className="relative h-full overflow-hidden rounded-3xl border border-cyan-300/30 bg-[#091329]/95 p-6 shadow-[inset_0_0_90px_rgba(34,211,238,0.06)]">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-cyan-100">25-Point Calibration</h2>
          <p className="text-sm text-slate-300">Focus on each target during the settling and sampling period to map iris vectors to screen pixels.</p>
          {phaseLabel && <p className="mt-1 text-sm font-medium text-cyan-200">{phaseLabel}</p>}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              if (active) send({ type: 'cancel_calibration' });
              onBack();
            }}
            className="min-h-[64px] min-w-[120px] rounded-2xl border border-slate-300/40 bg-slate-400/10 px-4 text-slate-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/10"
          >
            Return to Dashboard
          </button>
          <button
            type="button"
            onClick={() => send({ type: 'start_calibration' })}
            disabled={!connected}
            className="min-h-[64px] min-w-[120px] rounded-2xl border border-cyan-300/50 bg-cyan-400/20 px-4 text-cyan-50 transition hover:bg-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start
          </button>
          <button
            type="button"
            onClick={() => send({ type: 'cancel_calibration' })}
            disabled={!connected}
            className="min-h-[64px] min-w-[120px] rounded-2xl border border-pink-300/40 bg-pink-400/15 px-4 text-pink-50 transition hover:bg-pink-300/25 disabled:cursor-not-allowed disabled:opacity-50"
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

      <div className="relative mx-auto mt-4 h-[68vh] w-full rounded-2xl border border-cyan-300/30 bg-[#070e20] shadow-[0_0_45px_rgba(34,211,238,0.08)]">
        {targets.map((point, index) => {
          const screenWidth = Number(calibration?.screenWidth || window.screen.width);
          const screenHeight = Number(calibration?.screenHeight || window.screen.height);
          const left = (point[0] / Math.max(1, screenWidth)) * 100;
          const top = (point[1] / Math.max(1, screenHeight)) * 100;
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
                <div className="absolute h-16 w-16 rounded-full bg-cyan-300/30 blur-md" />
                <div className="relative h-8 w-8 rounded-full border border-cyan-50 bg-cyan-300 shadow-glow" />
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
          <p className="text-lg">
            Calibration and validation complete. Accuracy: {result.accuracy}% (training RMSE {result.rmse}, validation RMSE {result.validationRmse})
          </p>
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
          {result.validationComplete
            ? `Calibration completed, but validation failed (RMSE ${result.validationRmse ?? 'unavailable'}). Please try again.`
            : result.message || 'Calibration failed. Please try again.'}
        </div>
      )}
    </section>
  );
}
