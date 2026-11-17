import { useLayoutEffect, useRef, useState } from 'react';
import DwellRing from '@/components/DwellRing';
import CalibrationQuality from '@/components/CalibrationQuality';

export default function CalibrationScreen({ calibration, send, connected, onBack }) {
  const [profileName, setProfileName] = useState('default');
  const [surfaceSize, setSurfaceSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [displayMetrics, setDisplayMetrics] = useState(null);
  const [displayMetricsError, setDisplayMetricsError] = useState(null);
  const targetSurfaceRef = useRef(null);

  const active = calibration?.active;
  const targets = calibration?.targets || [];
  const currentIndex = calibration?.targetIndex ?? -1;
  const result = calibration?.result;
  const screenWidth = Number(calibration?.screenWidth || window.screen.width);
  const screenHeight = Number(calibration?.screenHeight || window.screen.height);
  const phaseLabel =
    calibration?.phase === 'validation'
      ? 'Validation: look at each fresh target'
      : calibration?.phase === 'training'
        ? 'Calibration: look at each target'
        : '';

  useLayoutEffect(() => {
    const updateSurfaceSize = () => {
      const surface = targetSurfaceRef.current;
      if (!surface) return;
      setSurfaceSize({
        width: surface.clientWidth,
        height: surface.clientHeight,
      });
    };

    updateSurfaceSize();
    const surface = targetSurfaceRef.current;
    const observer = typeof ResizeObserver !== 'undefined' && surface
      ? new ResizeObserver(updateSurfaceSize)
      : null;
    observer?.observe(surface);
    window.addEventListener('resize', updateSurfaceSize);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateSurfaceSize);
    };
  }, []);

  useLayoutEffect(() => {
    let mounted = true;
    const metricsRequest = window.irisAPI?.getDisplayMetrics?.();
    if (!metricsRequest) {
      setDisplayMetricsError('unavailable');
    } else {
      metricsRequest
        .then((metrics) => {
          if (mounted) setDisplayMetrics(metrics);
        })
        .catch((error) => {
          if (mounted) setDisplayMetricsError(error?.message || 'unavailable');
        });
    }

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="fixed inset-0 z-40 h-screen w-screen overflow-hidden bg-[#091329]/95">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 p-4">
        <div className="max-w-[560px]">
          <h2 className="iris-heading font-semibold text-cyan-100">25-Point Calibration</h2>
          {phaseLabel && <p className="mt-1 text-base font-medium text-cyan-200">{phaseLabel}</p>}
        </div>
        <div className="pointer-events-auto flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => {
              if (active) send({ type: 'cancel_calibration' });
              onBack();
            }}
            className="min-h-[48px] min-w-[104px] rounded-xl border border-slate-300/40 bg-slate-400/10 px-3 text-sm text-slate-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/10"
          >
            Return to Dashboard
          </button>
          <button
            type="button"
            onClick={() => send({ type: 'start_calibration' })}
            disabled={!connected}
            className="min-h-[48px] min-w-[104px] rounded-xl border border-cyan-300/50 bg-cyan-400/20 px-3 text-sm text-cyan-50 transition hover:bg-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start
          </button>
          <button
            type="button"
            onClick={() => send({ type: 'cancel_calibration' })}
            disabled={!connected}
            className="min-h-[48px] min-w-[104px] rounded-xl border border-pink-300/40 bg-pink-400/15 px-3 text-sm text-pink-50 transition hover:bg-pink-300/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>

      {!connected && (
        <div className="absolute left-6 top-32 z-20 rounded-2xl border border-rose-300/30 bg-rose-400/10 p-3 text-sm text-rose-100">
          Backend disconnected. Calibration controls require the Python gaze service to be running.
        </div>
      )}

      <div
        ref={targetSurfaceRef}
        className="absolute inset-0 h-full w-full bg-[#070e20]"
      >
        {targets.map((point, index) => {
          const renderedX = (point[0] / Math.max(1, screenWidth)) * surfaceSize.width;
          const renderedY = (point[1] / Math.max(1, screenHeight)) * surfaceSize.height;
          const isActive = active && currentIndex === index;

          return (
            <div
              key={`${point[0]}-${point[1]}`}
              data-intended-x={point[0]}
              data-intended-y={point[1]}
              data-rendered-x={renderedX}
              data-rendered-y={renderedY}
              className={`absolute z-30 -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ${
                isActive ? 'scale-110 opacity-100' : 'scale-90 opacity-45'
              }`}
              style={{ left: `${renderedX}px`, top: `${renderedY}px` }}
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

      {active && currentIndex >= 0 && targets[currentIndex] && (
        <div className="pointer-events-none absolute bottom-6 left-6 z-20 rounded-xl border border-cyan-300/20 bg-[#07111f]/80 px-3 py-2 text-xs text-cyan-100">
          Target {currentIndex + 1}/{targets.length}: intended ({targets[currentIndex][0]}, {targets[currentIndex][1]}) | rendered (
          {Math.round((targets[currentIndex][0] / Math.max(1, screenWidth)) * surfaceSize.width)},{' '}
          {Math.round((targets[currentIndex][1] / Math.max(1, screenHeight)) * surfaceSize.height)})
        </div>
      )}

      {result?.ok && (
        <div className="absolute bottom-6 left-1/2 z-20 w-[min(90vw,760px)] -translate-x-1/2 rounded-2xl border border-teal-300/30 bg-teal-300/10 p-4 text-teal-100">
          <CalibrationQuality calibration={calibration} calibrated />
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
        <div className="absolute bottom-6 left-1/2 z-20 w-[min(90vw,760px)] -translate-x-1/2 rounded-2xl border border-rose-300/30 bg-rose-400/10 p-4 text-rose-100">
          <CalibrationQuality calibration={calibration} />
          {result.validationComplete
            ? `Calibration completed, but validation failed (RMSE ${result.validationRmse ?? 'unavailable'}). Please try again.`
            : result.message || 'Calibration failed. Please try again.'}
        </div>
      )}
    </section>
  );
}
