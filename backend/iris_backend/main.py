import base64
import asyncio
import json
import signal
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
import pyautogui
from websockets.asyncio.server import serve

if __package__ is None or __package__ == '':
    import sys

    sys.path.append(str(Path(__file__).resolve().parent.parent))
    from iris_backend.blink import combined_ear
    from iris_backend.calibration import PolynomialCalibrator
    from iris_backend.config import (
        BLINK_EAR_THRESHOLD,
        BLINK_MIN_DURATION,
        CALIBRATION_POINT_SECONDS,
        CALIBRATION_SETTLE_SECONDS,
        CALIBRATION_MIN_SAMPLES,
        CALIBRATION_VALIDATION_SETTLE_SECONDS,
        CALIBRATION_VALIDATION_POINT_SECONDS,
        CALIBRATION_VALIDATION_MIN_SAMPLES,
        CALIBRATION_PREVIEW_FPS,
        TELEMETRY_SEND_TIMEOUT_SECONDS,
        CALIBRATION_EDGE_MARGIN,
        DWELL_COOLDOWN,
        DWELL_DURATION,
        DWELL_RADIUS,
        TARGET_FPS,
        WS_HOST,
        WS_PORT,
    )
    from iris_backend.kalman import KalmanFilter2D
    from iris_backend.storage import (
        DEFAULT_SETTINGS,
        load_profile_model,
        load_profiles,
        normalize_profile_name,
        profile_model_path,
        save_profile_model,
        save_profiles,
    )
else:
    from .blink import combined_ear
    from .calibration import PolynomialCalibrator
    from .config import (
        BLINK_EAR_THRESHOLD,
        BLINK_MIN_DURATION,
        CALIBRATION_POINT_SECONDS,
        CALIBRATION_SETTLE_SECONDS,
        CALIBRATION_MIN_SAMPLES,
        CALIBRATION_VALIDATION_SETTLE_SECONDS,
        CALIBRATION_VALIDATION_POINT_SECONDS,
        CALIBRATION_VALIDATION_MIN_SAMPLES,
        CALIBRATION_PREVIEW_FPS,
        TELEMETRY_SEND_TIMEOUT_SECONDS,
        CALIBRATION_EDGE_MARGIN,
        DWELL_COOLDOWN,
        DWELL_DURATION,
        DWELL_RADIUS,
        TARGET_FPS,
        WS_HOST,
        WS_PORT,
    )
    from .kalman import KalmanFilter2D
    from .storage import (
        DEFAULT_SETTINGS,
        load_profile_model,
        load_profiles,
        normalize_profile_name,
        profile_model_path,
        save_profile_model,
        save_profiles,
    )


pyautogui.FAILSAFE = False

FACE_LANDMARKER_MODEL_URL = (
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/'
    'face_landmarker/float16/1/face_landmarker.task'
)


@dataclass
class DwellState:
    anchor_x: float | None = None
    anchor_y: float | None = None
    started_at: float | None = None
    progress: float = 0.0


class IrisRuntime:
    def __init__(self):
        self.clients = set()
        self.running = True

        self.settings = DEFAULT_SETTINGS.copy()
        self.profile_db = load_profiles()
        self.active_profile = self.profile_db.get('activeProfile')
        self.calibrator = PolynomialCalibrator()
        self.kalman = KalmanFilter2D()

        self.screen_w, self.screen_h = pyautogui.size()
        self.error_message = None

        self.face_mesh = None
        self.face_landmarker = None
        self.mediapipe_mode = None
        self.mediapipe_ready = False
        self.mediapipe_error = None
        self._init_face_mesh()
        self.cap = None
        self.webcam_connected = False
        self.webcam_index = None
        self.webcam_mode = None
        self.camera_status = 'initializing'
        self.camera_recovery_hint = 'Starting camera detection.'
        self.last_webcam_scan_ts = 0.0
        self.webcam_rescan_interval = 2.0

        self.fps = 0.0
        self.pipeline_latency_ms = 0.0
        self.preview_frame = None
        self.last_preview_ts = 0.0
        self.preview_encode_ms = 0.0
        self.broadcast_latency_ms = 0.0
        self._telemetry_send_tasks = {}

        self.cursor_x = self.screen_w / 2
        self.cursor_y = self.screen_h / 2
        self.prev_raw_iris = None
        self.prev_tuned_x = self.cursor_x
        self.prev_tuned_y = self.cursor_y
        self.last_frame_ts = time.perf_counter()
        self.last_predicted_raw = None

        self.dwell = DwellState()
        self.last_click_ts = 0.0
        self.blink_started_ts = None

        self.calibration_active = False
        self.calibration_validated = False
        self.calibration_targets = self._build_calibration_targets()
        self.validation_targets = self._build_validation_targets()
        self.calibration_phase = 'idle'
        self.calibration_index = 0
        self.calibration_point_started_ts = None
        self.calibration_settle_started_ts = None
        self.calibration_point_progress = 0.0
        self.current_point_samples = []
        self.current_point_head_samples = []
        self.calibration_iris_samples = []
        self.calibration_screen_samples = []
        self.calibration_validation_iris = []
        self.calibration_validation_screen = []
        self.calibration_result = None

        self._load_active_profile()

    def _init_face_mesh(self):
        try:
            solutions = getattr(mp, 'solutions', None)
            if solutions is not None and hasattr(solutions, 'face_mesh'):
                self.face_mesh = solutions.face_mesh.FaceMesh(
                    max_num_faces=1,
                    refine_landmarks=True,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
                self.mediapipe_mode = 'legacy'
                self.mediapipe_ready = True
                self.mediapipe_error = None
                return

            self._init_tasks_face_landmarker()
        except Exception as exc:
            self.mediapipe_error = f'Failed to initialize Face Mesh: {exc}'
            self.mediapipe_ready = False
            self.settings['demoMode'] = True

    def _init_tasks_face_landmarker(self):
        try:
            tasks = getattr(mp, 'tasks', None)
            if tasks is None:
                raise RuntimeError('mediapipe.tasks is unavailable')

            from mediapipe.tasks.python import vision

            model_dir = Path(__file__).resolve().parent.parent / 'models'
            model_dir.mkdir(parents=True, exist_ok=True)
            model_path = model_dir / 'face_landmarker.task'
            if not model_path.exists():
                urllib.request.urlretrieve(FACE_LANDMARKER_MODEL_URL, model_path)

            base_options = tasks.BaseOptions(model_asset_path=str(model_path))
            options = vision.FaceLandmarkerOptions(
                base_options=base_options,
                running_mode=vision.RunningMode.VIDEO,
                num_faces=1,
            )

            self.face_landmarker = vision.FaceLandmarker.create_from_options(options)
            self.mediapipe_mode = 'tasks'
            self.mediapipe_ready = True
            self.mediapipe_error = None
        except Exception as exc:
            self.mediapipe_error = (
                'MediaPipe face tracking could not initialize. '
                f'{exc}. Enable Demo mode or check internet for model download.'
            )
            self.mediapipe_ready = False
            self.settings['demoMode'] = True

    def _build_calibration_targets(self):
        # Keep a small inset so the target remains visible, while covering the
        # complete usable screen including all four corners.
        xs = np.linspace(CALIBRATION_EDGE_MARGIN, 1.0 - CALIBRATION_EDGE_MARGIN, 5)
        ys = np.linspace(CALIBRATION_EDGE_MARGIN, 1.0 - CALIBRATION_EDGE_MARGIN, 5)
        points = []
        for y_norm in ys:
            for x_norm in xs:
                points.append((int(x_norm * self.screen_w), int(y_norm * self.screen_h)))
        return points

    def _build_validation_targets(self):
        # A short fresh pass covers corners, edges, and the centre without
        # repeating the full 25-point training duration.
        points = []
        edge = CALIBRATION_EDGE_MARGIN
        for y_norm in (edge, 0.5, 1.0 - edge):
            for x_norm in (edge, 0.5, 1.0 - edge):
                points.append((int(x_norm * self.screen_w), int(y_norm * self.screen_h)))
        return points

    def _load_active_profile(self):
        if not self.active_profile:
            return

        profile_data = self.profile_db.get('profiles', {}).get(self.active_profile, {})
        if not isinstance(profile_data, dict):
            return
        settings = profile_data.get('settings', {})
        self.settings.update(settings)
        profile_font_size = settings.get(
            'interfaceFontSize',
            settings.get('textDisplay', self.settings.get('interfaceFontSize', 'large')),
        )
        accessibility = profile_data.get('accessibility', {})
        if isinstance(accessibility, dict):
            interface_font_size = accessibility.get(
                'interfaceFontSize',
                accessibility.get(
                    'textDisplay',
                    profile_font_size,
                ),
            )
            self.settings.update(
                {
                    'keyboardSize': accessibility.get(
                        'keyboardSize', self.settings.get('keyboardSize', 'large')
                    ),
                    'cursorSpeedMultiplier': accessibility.get(
                        'cursorSpeed', self.settings.get('cursorSpeedMultiplier', 1.0)
                    ),
                    'dwellDuration': accessibility.get(
                        'dwellDuration', self.settings.get('dwellDuration', DWELL_DURATION)
                    ),
                    'displayContrast': accessibility.get(
                        'displayContrast', self.settings.get('displayContrast', 'standard')
                    ),
                    'textDisplay': interface_font_size,
                    'interfaceFontSize': interface_font_size,
                    'preferredTheme': accessibility.get(
                        'preferredTheme', self.settings.get('preferredTheme', 'dark')
                    ),
                }
            )

        model_data = load_profile_model(self.active_profile)
        if model_data:
            self.calibrator = PolynomialCalibrator.from_dict(model_data)
            self.calibration_validated = bool(
                self.calibrator.fitted and self.calibrator.validated
            )

    def _persist_current_settings(self):
        if not self.active_profile:
            save_profiles(self.profile_db)
            return

        profiles = self.profile_db.setdefault('profiles', {})
        profile_item = profiles.setdefault(self.active_profile, {})
        profile_item['settings'] = self.settings
        accessibility = profile_item.setdefault('accessibility', {})
        accessibility.update(
            {
                'keyboardSize': self.settings.get('keyboardSize', 'large'),
                'cursorSpeed': self.settings.get('cursorSpeedMultiplier', 1.0),
                'dwellDuration': self.settings.get('dwellDuration', DWELL_DURATION),
                'displayContrast': self.settings.get('displayContrast', 'standard'),
                'interfaceFontSize': self.settings.get('interfaceFontSize', 'large'),
                'textDisplay': self.settings.get('interfaceFontSize', 'large'),
                'preferredTheme': self.settings.get('preferredTheme', 'dark'),
            }
        )
        save_profiles(self.profile_db)

    def _webcam_mode(self):
        mode = str(self.settings.get('webcamMode', 'auto')).lower()
        if mode not in {'auto', 'laptop', 'external'}:
            return 'auto'
        return mode

    def _webcam_indices(self):
        mode = self._webcam_mode()
        if mode == 'laptop':
            return [0, 1, 2, 3, 4, 5]
        if mode == 'external':
            return [1, 2, 3, 4, 5, 0]
        # Auto mode prefers external devices, then falls back to the laptop camera.
        return [1, 2, 3, 4, 5, 0]

    def _open_webcam(self, index, backend):
        cap = cv2.VideoCapture(index, backend)
        cap.set(cv2.CAP_PROP_FPS, TARGET_FPS)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

        if cap.isOpened():
            test_ok, _ = cap.read()
            if test_ok:
                self.cap = cap
                self.webcam_index = index
                self.webcam_mode = self._webcam_mode()
                self.webcam_connected = True
                self.camera_status = 'connected'
                self.camera_recovery_hint = 'Camera is ready. Keep your face centered in view.'
                self.error_message = None
                self.last_webcam_scan_ts = time.perf_counter()
                print(f'I.R.I.S: webcam opened at index {index} with backend {backend}')
                return True

        try:
            cap.release()
        except Exception:
            pass
        return False

    def _encode_preview_frame(self, frame):
        preview = cv2.resize(frame, (360, 202), interpolation=cv2.INTER_AREA)
        ok, encoded = cv2.imencode(
            '.jpg',
            preview,
            [int(cv2.IMWRITE_JPEG_QUALITY), 65],
        )
        if not ok:
            return None
        return base64.b64encode(encoded).decode('ascii')

    def _init_webcam(self, force=False):
        now_ts = time.perf_counter()
        desired_mode = self._webcam_mode()

        if self.cap is not None and not force:
            current_group = 'internal' if self.webcam_index == 0 else 'external'
            if desired_mode == 'laptop' and current_group == 'internal':
                return
            if desired_mode == 'external' and current_group == 'external':
                return
            if desired_mode == 'auto':
                return
            self._close_webcam()
        elif not force and (now_ts - self.last_webcam_scan_ts) < self.webcam_rescan_interval:
            return

        # Try several OpenCV capture backends on Windows to avoid MSMF grab issues.
        self.camera_status = 'initializing'
        self.camera_recovery_hint = 'Searching for an available camera.'
        backends = []
        try:
            # prefer DirectShow, then MSMF, then system default
            backends = [getattr(cv2, 'CAP_DSHOW', 700), getattr(cv2, 'CAP_MSMF', 1400), cv2.CAP_ANY]
        except Exception:
            backends = [cv2.CAP_ANY]

        for index in self._webcam_indices():
            for backend in backends:
                try:
                    if self._open_webcam(index, backend):
                            return
                except Exception as e:
                    # ignore and try next backend or device index
                    print(f'I.R.I.S: webcam index {index} backend {backend} failed: {e}')

        # If we reach here, all attempts failed
        self.cap = None
        self.webcam_index = None
        self.webcam_connected = False
        self.camera_status = 'unavailable'
        self.camera_recovery_hint = (
            'Check Windows camera permissions, connect a camera, close other camera apps, and retry.'
        )
        self.last_webcam_scan_ts = now_ts
        self.error_message = (
            'Webcam unavailable or in use. Close other apps using the camera and retry.'
        )

    def _close_webcam(self):
        if self.cap is not None:
            self.cap.release()
            self.cap = None
        self.webcam_index = None
        self.webcam_mode = None
        self.webcam_connected = False

    def _extract_landmarks(self, frame, face_landmarks):
        h, w = frame.shape[:2]
        points = []
        for lm in face_landmarks.landmark:
            points.append(np.array([lm.x * w, lm.y * h], dtype=np.float64))
        return np.asarray(points)

    def _extract_landmarks_tasks(self, frame, task_result):
        if not task_result.face_landmarks:
            return None
        h, w = frame.shape[:2]
        points = []
        for lm in task_result.face_landmarks[0]:
            points.append(np.array([lm.x * w, lm.y * h], dtype=np.float64))
        return np.asarray(points)

    def _iris_vector(self, landmarks):
        left_iris = landmarks[468]
        right_iris = landmarks[473]

        left_left_corner = landmarks[33]
        left_right_corner = landmarks[133]
        right_left_corner = landmarks[362]
        right_right_corner = landmarks[263]

        left_top = landmarks[159]
        left_bottom = landmarks[145]
        right_top = landmarks[386]
        right_bottom = landmarks[374]

        left_width = max(abs(left_right_corner[0] - left_left_corner[0]), 1.0)
        right_width = max(abs(right_right_corner[0] - right_left_corner[0]), 1.0)
        left_height = max(abs(left_bottom[1] - left_top[1]), 1.0)
        right_height = max(abs(right_bottom[1] - right_top[1]), 1.0)

        left_center_x = (left_left_corner[0] + left_right_corner[0]) / 2.0
        right_center_x = (right_left_corner[0] + right_right_corner[0]) / 2.0
        left_center_y = (left_top[1] + left_bottom[1]) / 2.0
        right_center_y = (right_top[1] + right_bottom[1]) / 2.0

        iris_motion_scale_x = float(self.settings.get('irisMotionScaleX', 1.45))
        iris_motion_scale_y = float(self.settings.get('irisMotionScaleY', 2.2))

        # Centering the eye makes vertical motion less sensitive to eyelid shape and blink drift.
        left_norm_x = 0.5 + ((left_iris[0] - left_center_x) / left_width) * iris_motion_scale_x
        right_norm_x = 0.5 + ((right_iris[0] - right_center_x) / right_width) * iris_motion_scale_x
        left_norm_y = 0.5 + ((left_iris[1] - left_center_y) / left_height) * iris_motion_scale_y
        right_norm_y = 0.5 + ((right_iris[1] - right_center_y) / right_height) * iris_motion_scale_y

        return np.array([left_norm_x, left_norm_y, right_norm_x, right_norm_y], dtype=np.float64)

    def _head_pose_vector(self, landmarks):
        # Face position and scale provide a lightweight stability signal without
        # adding another MediaPipe model or changing the tracking cadence.
        face = np.asarray(landmarks, dtype=np.float64)
        min_x, min_y = np.min(face[:, 0]), np.min(face[:, 1])
        max_x, max_y = np.max(face[:, 0]), np.max(face[:, 1])
        width = max(max_x - min_x, 1.0)
        height = max(max_y - min_y, 1.0)
        nose = face[1]
        return np.array(
            [
                (nose[0] - min_x) / width,
                (nose[1] - min_y) / height,
                width / max(self.screen_w, 1),
            ],
            dtype=np.float64,
        )

    def _is_valid_iris_vector(self, iris_vector):
        # Reject extreme outliers that occur when landmarks drift at eye-angle extremes.
        return bool(np.all(iris_vector >= -0.65) and np.all(iris_vector <= 1.65))

    def _fallback_map(self, iris_vector):
        # Average left/right iris normalized coordinates
        x_norm_raw = float((iris_vector[0] + iris_vector[2]) / 2.0)
        y_norm_raw = float((iris_vector[1] + iris_vector[3]) / 2.0)

        # Keep the fallback path responsive even before calibration by compressing the neutral band.
        x_min_c, x_max_c = -0.08, 1.08
        y_min_c, y_max_c = 0.18, 0.82

        def remap(v, min_c, max_c):
            v = (v - min_c) / (max_c - min_c)
            return max(0.0, min(1.0, v))

        x_norm = remap(x_norm_raw, x_min_c, x_max_c)
        y_norm = remap(y_norm_raw, y_min_c, y_max_c)
        return x_norm * self.screen_w, y_norm * self.screen_h

    def _predict_cursor(self, iris_vector, dt):
        if self.prev_raw_iris is not None:
            alpha = float(self.settings.get('irisSmoothingAlpha', 0.4))
            alpha = max(0.05, min(0.95, alpha))
            iris_vector = (alpha * iris_vector) + ((1.0 - alpha) * self.prev_raw_iris)
        self.prev_raw_iris = iris_vector.copy()

        predicted = self.calibrator.predict(iris_vector)
        if predicted is None:
            predicted = self._fallback_map(iris_vector)
        # store the raw predicted (pre-tuning) value for telemetry/debug
        try:
            self.last_predicted_raw = (float(predicted[0]), float(predicted[1]))
        except Exception:
            self.last_predicted_raw = None

        x = max(0.0, min(float(self.screen_w - 1), float(predicted[0])))
        y = max(0.0, min(float(self.screen_h - 1), float(predicted[1])))
        # A fitted pixel model already covers the full screen. Applying
        # directional gains after calibration distorts its endpoints.
        if self.calibrator.fitted:
            tuned_x, tuned_y = x, y
        else:
            tuned_x, tuned_y = self._apply_cursor_tuning(x, y)
        tuned_x, tuned_y = self._limit_cursor_speed(tuned_x, tuned_y, dt)
        smooth_x, smooth_y = self.kalman.step((tuned_x, tuned_y), dt)

        smooth_x = max(0.0, min(float(self.screen_w - 1), smooth_x))
        smooth_y = max(0.0, min(float(self.screen_h - 1), smooth_y))
        return smooth_x, smooth_y

    def _apply_cursor_tuning(self, x, y):
        cx = self.screen_w / 2.0
        cy = self.screen_h / 2.0
        scale_x = float(self.settings.get('cursorScaleX', 1.0))
        scale_y = float(self.settings.get('cursorScaleY', 1.0))
        y_axis_sensitivity = float(self.settings.get('cursorYAxisSensitivity', 1.0))
        y_axis_sensitivity = max(0.9, min(1.15, y_axis_sensitivity))
        gain_left = float(self.settings.get('cursorGainLeft', 0.9))
        gain_right = float(self.settings.get('cursorGainRight', 1.25))
        gain_up = float(self.settings.get('cursorGainUp', 1.5))
        gain_down = float(self.settings.get('cursorGainDown', 1.35))
        invert_x = bool(self.settings.get('invertXAxis', False))
        invert_y = bool(self.settings.get('invertYAxis', False))
        offset_x = float(self.settings.get('cursorOffsetX', 0.0))
        offset_y = float(self.settings.get('cursorOffsetY', 0.0))

        dx = x - cx
        dy = y - cy
        if invert_x:
            dx = -dx
        if invert_y:
            dy = -dy

        dx = dx * scale_x * (gain_right if dx >= 0 else gain_left)
        dy = dy * scale_y * y_axis_sensitivity * (gain_down if dy >= 0 else gain_up)

        tuned_x = cx + dx + offset_x
        tuned_y = cy + dy + offset_y
        return tuned_x, tuned_y

    def _limit_cursor_speed(self, x, y, dt):
        max_speed = float(self.settings.get('maxCursorSpeed', 1600.0))
        max_speed = max(2800.0, max_speed)
        speed_multiplier = float(self.settings.get('cursorSpeedMultiplier', 0.5))
        speed_multiplier = max(0.9, min(1.0, speed_multiplier))
        max_step = (max_speed * speed_multiplier) * max(dt, 1.0 / TARGET_FPS)

        dx = x - self.prev_tuned_x
        dy = y - self.prev_tuned_y
        distance = float(np.hypot(dx, dy))
        if distance > max_step and distance > 0:
            ratio = max_step / distance
            x = self.prev_tuned_x + dx * ratio
            y = self.prev_tuned_y + dy * ratio

        self.prev_tuned_x = x
        self.prev_tuned_y = y
        return x, y

    def _process_dwell(self, x, y, now_ts):
        radius = float(self.settings.get('dwellRadius', DWELL_RADIUS))
        duration = float(self.settings.get('dwellDuration', DWELL_DURATION))
        click_cooldown = float(self.settings.get('clickCooldown', DWELL_COOLDOWN))

        if self.dwell.anchor_x is None:
            self.dwell.anchor_x = x
            self.dwell.anchor_y = y
            self.dwell.started_at = now_ts
            self.dwell.progress = 0.0
            return None

        distance = float(
            np.linalg.norm(np.array([x - self.dwell.anchor_x, y - self.dwell.anchor_y]))
        )
        if distance > radius:
            self.dwell.anchor_x = x
            self.dwell.anchor_y = y
            self.dwell.started_at = now_ts
            self.dwell.progress = 0.0
            return None

        elapsed = now_ts - self.dwell.started_at
        self.dwell.progress = min(1.0, elapsed / max(duration, 0.05))

        if elapsed >= duration and (now_ts - self.last_click_ts) >= click_cooldown:
            pyautogui.click(x=x, y=y)
            self.last_click_ts = now_ts
            self.dwell.started_at = now_ts
            self.dwell.progress = 0.0
            return {'type': 'dwell_click', 'x': x, 'y': y, 'at': now_ts}

        return None

    def _process_blink(self, ear, now_ts, x, y):
        if not self.settings.get('blinkClickEnabled', True):
            self.blink_started_ts = None
            return None

        ear_threshold = float(self.settings.get('blinkThreshold', BLINK_EAR_THRESHOLD))
        min_duration = float(self.settings.get('blinkMinDuration', BLINK_MIN_DURATION))
        click_cooldown = float(self.settings.get('clickCooldown', DWELL_COOLDOWN))

        if ear < ear_threshold:
            if self.blink_started_ts is None:
                self.blink_started_ts = now_ts
            elif (
                now_ts - self.blink_started_ts >= min_duration
                and now_ts - self.last_click_ts >= click_cooldown
            ):
                pyautogui.click(x=x, y=y)
                self.last_click_ts = now_ts
                self.blink_started_ts = None
                return {'type': 'blink_click', 'x': x, 'y': y, 'at': now_ts}
        else:
            self.blink_started_ts = None

        return None

    def _calibration_payload(self):
        targets = (
            self.validation_targets
            if self.calibration_phase == 'validation'
            else self.calibration_targets
        )
        return {
            'active': self.calibration_active,
            'phase': self.calibration_phase,
            'targetIndex': self.calibration_index if self.calibration_active else None,
            'targets': targets,
            'screenWidth': self.screen_w,
            'screenHeight': self.screen_h,
            'progress': self._calibration_progress(),
            'result': self.calibration_result,
        }

    def _calibration_progress(self):
        if not self.calibration_active:
            return 0.0
        return self.calibration_point_progress

    def _reset_calibration_point(self):
        self.calibration_point_started_ts = None
        self.calibration_settle_started_ts = None
        self.calibration_point_progress = 0.0
        self.current_point_samples = []
        self.current_point_head_samples = []

    def _start_calibration(self):
        self.calibration_active = True
        self.calibration_index = 0
        self._reset_calibration_point()
        self.calibration_iris_samples = []
        self.calibration_screen_samples = []
        self.calibration_validation_iris = []
        self.calibration_validation_screen = []
        self.calibration_result = None
        self.calibration_phase = 'training'
        self.calibration_validated = False
        self.calibrator.validated = False

    def _cancel_calibration(self):
        self.calibration_active = False
        self._reset_calibration_point()
        self.calibration_phase = 'idle'
        self.calibration_validated = False
        self.calibrator.validated = False
        self.calibration_result = {'ok': False, 'message': 'Calibration cancelled'}

    def _advance_calibration(self, iris_vector, head_pose):
        if not self.calibration_active:
            return

        now = time.perf_counter()

        if self.calibration_settle_started_ts is None:
            self.calibration_settle_started_ts = now

        is_validation = self.calibration_phase == 'validation'
        settle_seconds = (
            CALIBRATION_VALIDATION_SETTLE_SECONDS
            if is_validation
            else CALIBRATION_SETTLE_SECONDS
        )
        point_seconds = (
            CALIBRATION_VALIDATION_POINT_SECONDS
            if is_validation
            else CALIBRATION_POINT_SECONDS
        )
        minimum_samples = (
            CALIBRATION_VALIDATION_MIN_SAMPLES
            if is_validation
            else CALIBRATION_MIN_SAMPLES
        )

        settle_elapsed = now - self.calibration_settle_started_ts
        if settle_elapsed < settle_seconds:
            self.calibration_point_progress = min(
                0.35, 0.35 * settle_elapsed / max(settle_seconds, 0.01)
            )
            return

        if self.calibration_point_started_ts is None:
            self.calibration_point_started_ts = now

        elapsed = now - self.calibration_point_started_ts
        self.calibration_point_progress = min(1.0, elapsed / point_seconds)
        self.current_point_samples.append(iris_vector.copy())
        self.current_point_head_samples.append(head_pose.copy())

        if elapsed < point_seconds:
            return

        samples = np.asarray(self.current_point_samples, dtype=np.float64)
        head_samples = np.asarray(self.current_point_head_samples, dtype=np.float64)
        head_center = np.median(head_samples, axis=0)
        head_deviation = np.max(np.abs(head_samples - head_center), axis=0)
        stable_head = bool(np.all(head_deviation <= np.array([0.025, 0.025, 0.08])))
        accepted = (
            PolynomialCalibrator.filter_samples(samples, minimum_count=minimum_samples)
            if stable_head
            else np.empty((0, 4))
        )
        if len(accepted) < minimum_samples:
            self._reset_calibration_point()
            return

        targets = self.validation_targets if is_validation else self.calibration_targets
        target = targets[self.calibration_index]
        if is_validation:
            self.calibration_validation_iris.extend(accepted)
            self.calibration_validation_screen.extend([target] * len(accepted))
        else:
            self.calibration_iris_samples.extend(accepted)
            self.calibration_screen_samples.extend([target] * len(accepted))
        self.calibration_index += 1
        self._reset_calibration_point()

        if not is_validation and self.calibration_index >= len(self.calibration_targets):
            self.calibrator.fit(
                self.calibration_iris_samples,
                self.calibration_screen_samples,
            )
            self.calibration_phase = 'validation'
            self.calibration_index = 0
            self._reset_calibration_point()
            self.calibration_result = None
            return

        if is_validation and self.calibration_index >= len(self.validation_targets):
            validation = self.calibrator.validate(
                self.calibration_validation_iris,
                self.calibration_validation_screen,
            )
            max_dim = max(self.screen_w, self.screen_h)
            validation_rmse = validation['rmse']
            validation_passed = (
                validation_rmse is not None and validation_rmse <= max_dim * 0.1
            )
            training_rmse = self._training_rmse()
            self.calibration_active = False
            self.calibration_phase = 'complete'
            self.calibration_result = {
                'ok': bool(validation_passed),
                'calibrationComplete': True,
                'validationComplete': True,
                'validationPassed': bool(validation_passed),
                'accuracy': round(max(0.0, 100.0 - (training_rmse / max_dim) * 100.0), 2),
                'rmse': round(training_rmse, 2),
                'validationRmse': round(float(validation_rmse), 2)
                if validation_rmse is not None
                else None,
                'validationSamples': validation['sampleCount'],
                'samples': len(self.calibration_iris_samples),
            }
            self.calibration_validated = bool(validation_passed)
            self.calibrator.validated = self.calibration_validated

    def _training_rmse(self):
        if len(self.calibrator.training_iris_samples) == 0:
            return 0.0
        predictions = np.asarray(
            [
                self.calibrator.predict(sample)
                for sample in self.calibrator.training_iris_samples
            ]
        )
        targets = self.calibrator.training_screen_points
        return float(np.sqrt(np.mean(np.linalg.norm(predictions - targets, axis=1) ** 2)))

    def _profile_details(self):
        details = []
        for name, profile in self.profile_db.get('profiles', {}).items():
            if not isinstance(profile, dict):
                profile = {}
            model_data = load_profile_model(name)
            calibrated = bool(
                profile.get('calibrated', False)
                or (
                    model_data
                    and model_data.get('fitted', True)
                    and model_data.get('validated', True)
                )
            )
            details.append(
                {
                    'name': name,
                    'calibrated': calibrated,
                    'updatedAt': profile.get('updatedAt'),
                    'personal': profile.get('personal', {}),
                    'caregiver': profile.get('caregiver', {}),
                    'accessibility': profile.get('accessibility', {}),
                    'calibration': profile.get(
                        'calibration',
                        {'status': 'Validated' if calibrated else 'Uncalibrated'},
                    ),
                }
            )
        return details

    def _profiles_payload(self, result=None):
        payload = {
            'profiles': list(self.profile_db.get('profiles', {}).keys()),
            'profileDetails': self._profile_details(),
            'activeProfile': self.active_profile,
            'settings': self.settings,
        }
        if result is not None:
            payload['result'] = result
        return payload

    def _existing_profile_name(self, name, exclude=None):
        name_key = name.casefold()
        for existing_name in self.profile_db.get('profiles', {}):
            if existing_name != exclude and existing_name.casefold() == name_key:
                return existing_name
        return None

    @staticmethod
    def _optional_profile_text(value, field_name, max_length):
        if value is None:
            return ''
        if not isinstance(value, str):
            raise ValueError(f'{field_name} must be text')
        value = value.strip()
        if len(value) > max_length:
            raise ValueError(f'{field_name} is too long')
        return value

    def _profile_fields(self, data, require_full_name=True):
        data = data if isinstance(data, dict) else {}
        personal_data = data.get('personal', {})
        caregiver_data = data.get('caregiver', {})
        accessibility_data = data.get('accessibility', {})
        if not isinstance(personal_data, dict) or not isinstance(caregiver_data, dict) or not isinstance(accessibility_data, dict):
            raise ValueError('Profile sections must be objects')

        full_name = self._optional_profile_text(
            personal_data.get('fullName', ''),
            'Full name',
            120,
        )
        if require_full_name and not full_name:
            raise ValueError('Full name is required')

        photo = self._optional_profile_text(personal_data.get('photo', ''), 'Profile photo', 700000)
        if photo and not photo.startswith('data:image/'):
            raise ValueError('Profile photo must be an image')

        keyboard_size = accessibility_data.get('keyboardSize', self.settings.get('keyboardSize', 'large'))
        if keyboard_size not in {'small', 'medium', 'large'}:
            raise ValueError('Keyboard size must be Small, Medium, or Large')
        contrast = accessibility_data.get('displayContrast', 'standard')
        if contrast not in {'standard', 'high'}:
            raise ValueError('Display contrast must be standard or high')
        voice_typing = bool(accessibility_data.get('voiceTyping', True))
        interface_font_size = accessibility_data.get(
            'interfaceFontSize',
            accessibility_data.get(
                'textDisplay',
                self.settings.get(
                    'interfaceFontSize',
                    self.settings.get('textDisplay', 'large'),
                ),
            ),
        )
        if interface_font_size not in {'small', 'standard', 'large', 'extra_large'}:
            raise ValueError('Interface font size is invalid')
        preferred_theme = accessibility_data.get('preferredTheme', 'dark')
        if preferred_theme not in {'light', 'dark'}:
            raise ValueError('Preferred theme must be light or dark')

        cursor_speed = float(accessibility_data.get('cursorSpeed', self.settings.get('cursorSpeedMultiplier', 1.0)))
        dwell_duration = float(accessibility_data.get('dwellDuration', self.settings.get('dwellDuration', DWELL_DURATION)))
        if not 0.25 <= cursor_speed <= 2.0:
            raise ValueError('Cursor speed must be between 0.25 and 2.0')
        if not 0.3 <= dwell_duration <= 3.0:
            raise ValueError('Dwell duration must be between 0.3 and 3.0 seconds')

        return {
            'personal': {
                'fullName': full_name,
                'preferredName': self._optional_profile_text(personal_data.get('preferredName', ''), 'Preferred name', 80),
                'ageOrDob': self._optional_profile_text(personal_data.get('ageOrDob', ''), 'Age or date of birth', 40),
                'gender': self._optional_profile_text(personal_data.get('gender', ''), 'Gender', 40),
                'photo': photo,
            },
            'caregiver': {
                'name': self._optional_profile_text(caregiver_data.get('name', ''), 'Caregiver name', 120),
                'relationship': self._optional_profile_text(caregiver_data.get('relationship', ''), 'Caregiver relationship', 80),
                'contactNumber': self._optional_profile_text(caregiver_data.get('contactNumber', ''), 'Caregiver contact number', 40),
                'emergencyContact': self._optional_profile_text(caregiver_data.get('emergencyContact', ''), 'Emergency contact', 120),
            },
            'accessibility': {
                'keyboardSize': keyboard_size,
                'cursorSpeed': cursor_speed,
                'dwellDuration': dwell_duration,
                'displayContrast': contrast,
                'preferredTheme': preferred_theme,
                'voiceTyping': voice_typing,
                'interfaceFontSize': interface_font_size,
                'textDisplay': interface_font_size,
            },
        }

    def _create_profile(self, name, profile_data=None):
        try:
            name = normalize_profile_name(name)
            fields = self._profile_fields(profile_data or {})
        except ValueError as error:
            return {'ok': False, 'error': str(error)}

        profiles = self.profile_db.setdefault('profiles', {})
        if self._existing_profile_name(name) or profile_model_path(name).exists():
            return {'ok': False, 'error': 'A profile with that name already exists'}

        profiles[name] = {
            'settings': self.settings.copy(),
            'calibrated': False,
            **fields,
            'calibration': {'status': 'Uncalibrated'},
            'createdAt': int(time.time()),
            'updatedAt': int(time.time()),
        }
        save_profiles(self.profile_db)
        return {
            'ok': True,
            'profile': name,
            'message': 'Profile created. Complete calibration before using it for gaze control.',
        }

    def _save_profile(self, name):
        if (
            not self.calibrator.fitted
            or not self.calibrator.validated
            or not self.calibration_validated
        ):
            return {'ok': False, 'error': 'Calibration must pass validation before saving'}

        try:
            name = normalize_profile_name(name)
        except ValueError as error:
            return {'ok': False, 'error': str(error)}

        profiles = self.profile_db.setdefault('profiles', {})
        existing_name = self._existing_profile_name(name)
        if existing_name and existing_name != name:
            return {'ok': False, 'error': 'A profile with that name already exists'}
        existing = profiles.get(name)
        if existing and existing.get('calibrated', False):
            return {'ok': False, 'error': 'A calibrated profile with that name already exists'}
        if profile_model_path(name).exists():
            return {'ok': False, 'error': 'A profile with that name already exists'}

        save_profile_model(name, self.calibrator.to_dict())
        profiles[name] = existing or {
            'personal': {
                'fullName': name,
                'preferredName': '',
                'ageOrDob': '',
                'gender': '',
                'photo': '',
            },
            'caregiver': {
                'name': '',
                'relationship': '',
                'contactNumber': '',
                'emergencyContact': '',
            },
            'accessibility': {
                'keyboardSize': self.settings.get('keyboardSize', 'large'),
                'cursorSpeed': self.settings.get('cursorSpeedMultiplier', 1.0),
                'dwellDuration': self.settings.get('dwellDuration', DWELL_DURATION),
                'displayContrast': 'standard',
                'preferredTheme': 'dark',
                'voiceTyping': True,
                'interfaceFontSize': 'large',
                'textDisplay': 'large',
            },
        }
        profiles[name]['settings'] = self.settings.copy()
        profiles[name]['calibrated'] = True
        profiles[name]['calibration'] = {
            'status': 'Validated',
            'validationRmse': (self.calibration_result or {}).get('validationRmse'),
            'lastCalibratedAt': int(time.time()),
            'screenWidth': self.screen_w,
            'screenHeight': self.screen_h,
        }
        profiles[name]['updatedAt'] = int(time.time())
        self.profile_db['activeProfile'] = name
        self.active_profile = name
        save_profiles(self.profile_db)

        return {'ok': True, 'profile': name}

    def _load_profile(self, name):
        try:
            name = normalize_profile_name(name)
        except ValueError as error:
            return {'ok': False, 'error': str(error)}

        if name not in self.profile_db.get('profiles', {}):
            return {'ok': False, 'error': f'Profile not found: {name}'}

        model_data = load_profile_model(name)
        profile_data = self.profile_db['profiles'][name]
        if not isinstance(profile_data, dict):
            return {'ok': False, 'error': 'Profile metadata is corrupted'}
        if not model_data and profile_data.get('calibrated', False):
            return {'ok': False, 'error': f'Profile model is missing or corrupted: {name}'}

        self.calibrator = (
            PolynomialCalibrator.from_dict(model_data)
            if model_data
            else PolynomialCalibrator()
        )
        self.calibration_validated = bool(self.calibrator.fitted and self.calibrator.validated)
        self.active_profile = name
        self.profile_db['activeProfile'] = name

        profile_settings = profile_data.get('settings', {})
        self.settings.update(profile_settings)
        profile_font_size = profile_settings.get(
            'interfaceFontSize',
            profile_settings.get('textDisplay', self.settings.get('interfaceFontSize', 'large')),
        )
        accessibility = profile_data.get('accessibility', {})
        if isinstance(accessibility, dict):
            interface_font_size = accessibility.get(
                'interfaceFontSize',
                accessibility.get(
                    'textDisplay',
                    profile_font_size,
                ),
            )
            self.settings.update(
                {
                    'keyboardSize': accessibility.get(
                        'keyboardSize', self.settings.get('keyboardSize', 'large')
                    ),
                    'cursorSpeedMultiplier': accessibility.get(
                        'cursorSpeed', self.settings.get('cursorSpeedMultiplier', 1.0)
                    ),
                    'dwellDuration': accessibility.get(
                        'dwellDuration', self.settings.get('dwellDuration', DWELL_DURATION)
                    ),
                    'displayContrast': accessibility.get(
                        'displayContrast', self.settings.get('displayContrast', 'standard')
                    ),
                    'interfaceFontSize': interface_font_size,
                    'textDisplay': interface_font_size,
                    'preferredTheme': accessibility.get(
                        'preferredTheme', self.settings.get('preferredTheme', 'dark')
                    ),
                }
            )
        save_profiles(self.profile_db)
        return {'ok': True, 'profile': name}

    def _update_profile(self, name, profile_data):
        try:
            name = normalize_profile_name(name)
            fields = self._profile_fields(profile_data)
        except ValueError as error:
            return {'ok': False, 'error': str(error)}

        profiles = self.profile_db.get('profiles', {})
        current = profiles.get(name)
        if not isinstance(current, dict):
            return {'ok': False, 'error': 'Profile not found or corrupted'}
        current.update(fields)
        current['updatedAt'] = int(time.time())
        if name == self.active_profile:
            self.settings['keyboardSize'] = fields['accessibility']['keyboardSize']
            self.settings['cursorSpeedMultiplier'] = fields['accessibility']['cursorSpeed']
            self.settings['dwellDuration'] = fields['accessibility']['dwellDuration']
            self.settings['displayContrast'] = fields['accessibility']['displayContrast']
            self.settings['interfaceFontSize'] = fields['accessibility']['interfaceFontSize']
            self.settings['textDisplay'] = fields['accessibility']['interfaceFontSize']
            self.settings['preferredTheme'] = fields['accessibility']['preferredTheme']
            current['settings'] = self.settings.copy()
        save_profiles(self.profile_db)
        return {'ok': True, 'profile': name, 'message': 'Profile details updated.'}

    def _rename_profile(self, old_name, new_name):
        try:
            old_name = normalize_profile_name(old_name)
            new_name = normalize_profile_name(new_name)
        except ValueError as error:
            return {'ok': False, 'error': str(error)}

        profiles = self.profile_db.get('profiles', {})
        if old_name not in profiles:
            return {'ok': False, 'error': f'Profile not found: {old_name}'}
        if self._existing_profile_name(new_name, exclude=old_name) or profile_model_path(new_name).exists():
            return {'ok': False, 'error': 'A profile with that name already exists'}

        old_model = profile_model_path(old_name)
        new_model = profile_model_path(new_name)
        try:
            if old_model.exists():
                old_model.replace(new_model)
        except OSError as error:
            return {'ok': False, 'error': f'Unable to rename profile model: {error}'}

        profiles[new_name] = profiles.pop(old_name)
        profiles[new_name]['updatedAt'] = int(time.time())
        if self.active_profile == old_name:
            self.active_profile = new_name
            self.profile_db['activeProfile'] = new_name
        save_profiles(self.profile_db)
        return {'ok': True, 'profile': new_name}

    def _delete_profile(self, name):
        try:
            name = normalize_profile_name(name)
        except ValueError as error:
            return {'ok': False, 'error': str(error)}

        profiles = self.profile_db.get('profiles', {})
        if name not in profiles:
            return {'ok': False, 'error': f'Profile not found: {name}'}
        if name == self.active_profile:
            return {
                'ok': False,
                'error': 'Load another profile before deleting the active profile',
            }

        model_path = profile_model_path(name)
        try:
            if model_path.exists():
                model_path.unlink()
            del profiles[name]
            save_profiles(self.profile_db)
        except OSError as error:
            return {'ok': False, 'error': f'Unable to delete profile: {error}'}
        return {'ok': True, 'profile': name}

    async def _broadcast(self, payload):
        if not self.clients:
            return

        started = time.perf_counter()
        encoded = json.dumps(payload)
        if payload.get('type') == 'telemetry':
            for ws in list(self.clients):
                task = self._telemetry_send_tasks.get(ws)
                if task is not None and not task.done():
                    continue
                task = asyncio.create_task(self._send_telemetry(ws, encoded))
                self._telemetry_send_tasks[ws] = task
                task.add_done_callback(
                    lambda completed, client=ws: self._telemetry_send_finished(
                        client, completed
                    )
                )
            self.broadcast_latency_ms = (time.perf_counter() - started) * 1000.0
            return

        disconnected = []
        for ws in list(self.clients):
            try:
                await ws.send(encoded)
            except Exception:
                disconnected.append(ws)
        self.broadcast_latency_ms = (time.perf_counter() - started) * 1000.0

        for ws in disconnected:
            self.clients.discard(ws)

    async def _send_telemetry(self, websocket, encoded):
        try:
            await asyncio.wait_for(
                websocket.send(encoded),
                timeout=TELEMETRY_SEND_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            self.clients.discard(websocket)
        except Exception:
            self.clients.discard(websocket)

    def _telemetry_send_finished(self, websocket, task):
        if self._telemetry_send_tasks.get(websocket) is task:
            self._telemetry_send_tasks.pop(websocket, None)
        if not task.cancelled():
            task.exception()

    async def _handle_message(self, data):
        msg_type = data.get('type')

        if msg_type == 'start_calibration':
            self.calibration_validated = False
            self.calibrator.validated = False
            if not self.mediapipe_ready:
                self.calibration_result = {
                    'ok': False,
                    'message': self.mediapipe_error
                    or 'Face Mesh unavailable. Install a compatible Python/MediaPipe setup.',
                }
                await self._broadcast({'type': 'calibration_state', **self._calibration_payload()})
                return

            if self.settings.get('demoMode', False):
                self.calibration_result = {
                    'ok': False,
                    'message': 'Disable Demo mode to run webcam calibration.',
                }
                await self._broadcast({'type': 'calibration_state', **self._calibration_payload()})
                return

            self._start_calibration()
            await self._broadcast({'type': 'calibration_state', **self._calibration_payload()})

        elif msg_type == 'cancel_calibration':
            self._cancel_calibration()
            await self._broadcast({'type': 'calibration_state', **self._calibration_payload()})

        elif msg_type == 'save_profile':
            result = self._save_profile(data.get('name', ''))
            await self._broadcast(
                {
                    'type': 'profiles',
                    **self._profiles_payload(result),
                }
            )

        elif msg_type == 'load_profile':
            result = self._load_profile(data.get('name', ''))
            await self._broadcast(
                {
                    'type': 'profiles',
                    **self._profiles_payload(result),
                }
            )

        elif msg_type == 'create_profile':
            result = self._create_profile(data.get('name', ''), data.get('profile'))
            await self._broadcast(
                {
                    'type': 'profiles',
                    **self._profiles_payload(result),
                }
            )

        elif msg_type == 'update_profile':
            result = self._update_profile(data.get('name', ''), data.get('profile'))
            await self._broadcast(
                {
                    'type': 'profiles',
                    **self._profiles_payload(result),
                }
            )

        elif msg_type == 'rename_profile':
            result = self._rename_profile(data.get('oldName', ''), data.get('newName', ''))
            await self._broadcast(
                {
                    'type': 'profiles',
                    **self._profiles_payload(result),
                }
            )

        elif msg_type == 'delete_profile':
            result = self._delete_profile(data.get('name', ''))
            await self._broadcast(
                {
                    'type': 'profiles',
                    **self._profiles_payload(result),
                }
            )

        elif msg_type == 'update_settings':
            incoming = data.get('settings', {})
            self.settings.update(incoming)
            self._persist_current_settings()
            await self._broadcast({'type': 'settings', 'settings': self.settings})

        elif msg_type == 'set_demo_mode':
            enabled = bool(data.get('enabled', False))
            self.settings['demoMode'] = enabled
            self._persist_current_settings()
            if enabled:
                self._close_webcam()
                self.error_message = None
            await self._broadcast({'type': 'settings', 'settings': self.settings})

        elif msg_type == 'request_state':
            await self._broadcast(
                {
                    'type': 'state',
                    'settings': self.settings,
                    **self._profiles_payload(),
                    'calibration': self._calibration_payload(),
                }
            )

    async def websocket_handler(self, websocket):
        self.clients.add(websocket)
        await websocket.send(
            json.dumps(
                {
                    'type': 'hello',
                    'settings': self.settings,
                    **self._profiles_payload(),
                    'calibration': self._calibration_payload(),
                }
            )
        )

        try:
            async for raw in websocket:
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                await self._handle_message(data)
        finally:
            self.clients.discard(websocket)
            task = self._telemetry_send_tasks.pop(websocket, None)
            if task is not None and not task.done():
                task.cancel()

    async def process_loop(self):
        target_frame_dt = 1.0 / TARGET_FPS

        while self.running:
            frame_start = time.perf_counter()
            now_ts = frame_start
            dt = max(1.0 / TARGET_FPS, now_ts - self.last_frame_ts)
            self.last_frame_ts = now_ts

            click_event = None
            ear_value = 1.0
            face_found = False
            preview_payload = None

            if self.settings.get('demoMode', False):
                mx, my = pyautogui.position()
                self.cursor_x, self.cursor_y = self.kalman.step((mx, my), dt)
                self.dwell.progress = 0.0
                self.webcam_connected = False
                if self.mediapipe_ready:
                    self.camera_status = 'demo'
                    self.camera_recovery_hint = 'Demo mode is active; no webcam frames are being processed.'
                    self.error_message = None
                else:
                    self.camera_status = 'mediapipe_error'
                    self.camera_recovery_hint = (
                        'MediaPipe could not start. Check the backend installation or enable Demo mode.'
                    )
                    self.error_message = self.mediapipe_error
            else:
                if not self.mediapipe_ready:
                    self.error_message = self.mediapipe_error
                    self.webcam_connected = False
                    self.camera_status = 'mediapipe_error'
                    self.camera_recovery_hint = (
                        'MediaPipe could not start. Check the backend installation or enable Demo mode.'
                    )
                    await asyncio.sleep(0.2)
                    await self._broadcast(
                        {
                            'type': 'telemetry',
                            'cursor': {'x': self.cursor_x, 'y': self.cursor_y},
                            'dwellProgress': self.dwell.progress,
                            'clickEvent': None,
                            'status': self._status_payload(),
                            'calibration': self._calibration_payload(),
                        }
                    )
                    continue

                self._init_webcam()

                if self.cap is None:
                    await asyncio.sleep(0.2)
                    await self._broadcast(
                        {
                            'type': 'telemetry',
                            'cursor': {'x': self.cursor_x, 'y': self.cursor_y},
                            'dwellProgress': self.dwell.progress,
                            'clickEvent': None,
                            'status': self._status_payload(),
                            'calibration': self._calibration_payload(),
                        }
                    )
                    continue

                success, frame = self.cap.read()
                if not success:
                    self.webcam_connected = False
                    self.camera_status = 'device_error'
                    self.camera_recovery_hint = (
                        'The camera stopped responding. Check its connection and Windows privacy permissions.'
                    )
                    self.error_message = 'Webcam frame capture failed.'
                    self._close_webcam()
                    await asyncio.sleep(0.1)
                    continue

                self.webcam_connected = True
                if now_ts - self.last_preview_ts >= 1.0 / CALIBRATION_PREVIEW_FPS:
                    preview_started = time.perf_counter()
                    self.preview_frame = self._encode_preview_frame(frame)
                    self.preview_encode_ms = (time.perf_counter() - preview_started) * 1000.0
                    self.last_preview_ts = now_ts
                    preview_payload = self.preview_frame
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                landmarks = None
                if self.mediapipe_mode == 'legacy' and self.face_mesh is not None:
                    results = self.face_mesh.process(rgb)
                    if results.multi_face_landmarks:
                        landmarks = self._extract_landmarks(frame, results.multi_face_landmarks[0])
                elif self.mediapipe_mode == 'tasks' and self.face_landmarker is not None:
                    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                    task_result = self.face_landmarker.detect_for_video(
                        mp_image,
                        int(now_ts * 1000),
                    )
                    landmarks = self._extract_landmarks_tasks(frame, task_result)

                if landmarks is not None and len(landmarks) > 473:
                    face_found = True
                    self.camera_status = 'connected'
                    self.camera_recovery_hint = 'Camera is ready. Face detected.'
                    self.error_message = None
                    iris_vector = self._iris_vector(landmarks)
                    if not self._is_valid_iris_vector(iris_vector):
                        self.error_message = 'Gaze landmark drift detected. Hold gaze steady for a moment.'
                        self.dwell.progress = 0.0
                        await asyncio.sleep(0.01)
                        continue

                    self._advance_calibration(iris_vector, self._head_pose_vector(landmarks))

                    self.cursor_x, self.cursor_y = self._predict_cursor(iris_vector, dt)
                    if not self.calibration_active:
                        pyautogui.moveTo(self.cursor_x, self.cursor_y, _pause=False)

                    if not self.calibration_active:
                        click_event = self._process_dwell(self.cursor_x, self.cursor_y, now_ts)
                    ear_value = combined_ear(landmarks)
                    if not self.calibration_active:
                        blink_click = self._process_blink(
                            ear=ear_value,
                            now_ts=now_ts,
                            x=self.cursor_x,
                            y=self.cursor_y,
                        )
                        if blink_click:
                            click_event = blink_click
                else:
                    self.camera_status = 'face_not_detected'
                    self.camera_recovery_hint = (
                        'Move into the camera view, improve lighting, and keep your face centered.'
                    )
                    self.error_message = 'Face not detected. Center your face in the camera frame.'
                    self.dwell.progress = 0.0
                    if self.calibration_active:
                        self._reset_calibration_point()

            elapsed = time.perf_counter() - frame_start
            self.pipeline_latency_ms = elapsed * 1000.0

            payload = {
                'type': 'telemetry',
                'cursor': {'x': self.cursor_x, 'y': self.cursor_y},
                'dwellProgress': self.dwell.progress,
                'clickEvent': click_event,
                'previewFrame': preview_payload,
                'rawIris': None,
                'predictedRaw': self.last_predicted_raw,
                'ear': round(float(ear_value), 4),
                'status': self._status_payload(face_found=face_found, ear=ear_value),
                'calibration': self._calibration_payload(),
            }
            # include raw iris vector when available (helps debug mirroring/calibration)
            if face_found and 'iris_vector' in locals():
                try:
                    payload['rawIris'] = [float(x) for x in iris_vector.tolist()]
                except Exception:
                    payload['rawIris'] = None
            await self._broadcast(payload)

            delay = max(0.0, target_frame_dt - (time.perf_counter() - frame_start))
            await asyncio.sleep(delay)

    def _status_payload(self, face_found=False, ear=1.0):
        camera_status = (
            'mediapipe_error'
            if not self.mediapipe_ready
            else self.camera_status
        )
        return {
            'webcamConnected': self.webcam_connected,
            'calibrated': bool(self.calibrator.fitted and self.calibration_validated),
            'fps': 0.0,
            'latencyMs': round(self.pipeline_latency_ms, 2),
            'previewEncodeMs': round(self.preview_encode_ms, 2),
            'broadcastScheduleMs': round(self.broadcast_latency_ms, 2),
            'error': self.error_message,
            'cameraStatus': camera_status,
            'cameraRecoveryHint': self.camera_recovery_hint,
            'demoMode': bool(self.settings.get('demoMode', False)),
            'faceFound': face_found,
            'blinkEAR': round(float(ear), 3),
            'activeProfile': self.active_profile,
            'mediapipeReady': self.mediapipe_ready,
            'mediapipeMode': self.mediapipe_mode,
            'screenWidth': self.screen_w,
            'screenHeight': self.screen_h,
            'webcamMode': self._webcam_mode(),
            'webcamIndex': self.webcam_index,
        }

    async def run(self):
        async with serve(self.websocket_handler, WS_HOST, WS_PORT):
            print(f'I.R.I.S backend WebSocket server running on ws://{WS_HOST}:{WS_PORT}')
            await self.process_loop()

    def shutdown(self):
        self.running = False
        self._close_webcam()
        if self.face_mesh is not None:
            self.face_mesh.close()
        if self.face_landmarker is not None:
            self.face_landmarker.close()


async def main():
    runtime = IrisRuntime()
    loop = asyncio.get_running_loop()

    def stop_handler(*_):
        runtime.shutdown()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop_handler)
        except NotImplementedError:
            pass

    try:
        await runtime.run()
    finally:
        runtime.shutdown()


if __name__ == '__main__':
    asyncio.run(main())
