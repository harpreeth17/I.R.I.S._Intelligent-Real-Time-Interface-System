const CAMERA_STATUS = {
  initializing: {
    label: 'Initializing',
    className: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  },
  connected: {
    label: 'Connected',
    className: 'border-teal-300/30 bg-teal-300/10 text-teal-100',
  },
  unavailable: {
    label: 'Unavailable',
    className: 'border-rose-300/30 bg-rose-300/10 text-rose-100',
  },
  device_error: {
    label: 'Device or permission error',
    className: 'border-rose-300/30 bg-rose-300/10 text-rose-100',
  },
  face_not_detected: {
    label: 'Face not detected',
    className: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  },
  mediapipe_error: {
    label: 'MediaPipe unavailable',
    className: 'border-rose-300/30 bg-rose-300/10 text-rose-100',
  },
  demo: {
    label: 'Demo mode',
    className: 'border-sky-300/30 bg-sky-300/10 text-sky-100',
  },
};

export function getCameraStatus(status) {
  if (status?.cameraStatus === 'mediapipe_error') return CAMERA_STATUS.mediapipe_error;
  if (status?.demoMode) return CAMERA_STATUS.demo;
  if (status?.cameraStatus && CAMERA_STATUS[status.cameraStatus]) {
    return CAMERA_STATUS[status.cameraStatus];
  }
  if (status?.webcamConnected && status?.faceFound === false) return CAMERA_STATUS.face_not_detected;
  if (status?.webcamConnected) return CAMERA_STATUS.connected;
  if (status?.error) return CAMERA_STATUS.unavailable;
  return CAMERA_STATUS[status?.cameraStatus] || CAMERA_STATUS.initializing;
}

export default function CameraStatus({ status, compact = false }) {
  const camera = getCameraStatus(status);
  const recoveryHint = status?.cameraRecoveryHint;

  return (
    <div className={compact ? '' : 'space-y-2'}>
      <span className={`inline-flex rounded-xl border px-3 py-1 text-xs ${camera.className}`}>
        Camera: {camera.label}
      </span>
      {!compact && recoveryHint && <p className="text-xs text-slate-400">{recoveryHint}</p>}
    </div>
  );
}
