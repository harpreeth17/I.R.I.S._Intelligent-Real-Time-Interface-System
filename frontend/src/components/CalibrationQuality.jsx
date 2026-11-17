function formatRmse(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value} px` : 'unavailable';
}

export default function CalibrationQuality({ calibration, calibrated = false }) {
  const result = calibration?.result;
  const validated = calibrated || result?.validationPassed === true;
  const failed =
    result?.validationComplete === true &&
    result?.validationPassed === false;
  const inProgress = calibration?.active === true;

  if (validated) {
    return (
      <div className="rounded-2xl border border-teal-300/30 bg-teal-300/10 p-4 text-sm text-teal-100">
        <p className="font-semibold">Calibration validated</p>
        <p className="mt-1 text-teal-100/80">
          Validation RMSE: {formatRmse(result?.validationRmse)}. Training RMSE: {formatRmse(result?.rmse)}.
        </p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="rounded-2xl border border-rose-300/30 bg-rose-400/10 p-4 text-sm text-rose-100">
        <p className="font-semibold">Calibration validation failed</p>
        <p className="mt-1 text-rose-100/80">
          Validation RMSE: {formatRmse(result?.validationRmse)}. Recalibrate with your face centered and steady.
        </p>
      </div>
    );
  }

  if (inProgress) {
    return (
      <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
        <p className="font-semibold">Calibration quality pending</p>
        <p className="mt-1 text-amber-100/80">
          Quality is reported after the independent validation stage completes.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-300/20 bg-slate-300/5 p-4 text-sm text-slate-300">
      <p className="font-semibold text-slate-200">Calibration quality unavailable</p>
      <p className="mt-1">Complete calibration and validation before relying on gaze positioning.</p>
    </div>
  );
}
