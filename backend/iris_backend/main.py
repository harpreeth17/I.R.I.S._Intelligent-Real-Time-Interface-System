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
        self.last_webcam_scan_ts = 0.0
        self.webcam_rescan_interval = 2.0

        self.fps = 0.0
        self.pipeline_latency_ms = 0.0
        self.preview_frame = None

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
        self.calibration_targets = self._build_calibration_targets()
        self.calibration_index = 0
        self.calibration_started_ts = 0.0
        self.current_point_samples = []
        self.calibration_iris_samples = []
        self.calibration_screen_samples = []
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
        # Use calibration targets near the screen edges and center to improve mapping
        xs = [0.02, 0.5, 0.98]
        ys = [0.02, 0.5, 0.98]
        points = []
        for y_norm in ys:
            for x_norm in xs:
                points.append((int(x_norm * self.screen_w), int(y_norm * self.screen_h)))
        return points

    def _load_active_profile(self):
        if not self.active_profile:
            return

        profile_data = self.profile_db.get('profiles', {}).get(self.active_profile, {})
        settings = profile_data.get('settings', {})
        self.settings.update(settings)

        model_data = load_profile_model(self.active_profile)
        if model_data:
            self.calibrator = PolynomialCalibrator.from_dict(model_data)

    def _persist_current_settings(self):
        if not self.active_profile:
            save_profiles(self.profile_db)
            return

        profiles = self.profile_db.setdefault('profiles', {})
        profile_item = profiles.setdefault(self.active_profile, {})
        profile_item['settings'] = self.settings
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
            if desired_mode == 'auto' and current_group == 'external':
                return
            if desired_mode == 'auto' and current_group == 'internal' and (now_ts - self.last_webcam_scan_ts) < self.webcam_rescan_interval:
                return
            self._close_webcam()
        elif not force and (now_ts - self.last_webcam_scan_ts) < self.webcam_rescan_interval:
            return

        # Try several OpenCV capture backends on Windows to avoid MSMF grab issues.
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
        y_axis_sensitivity = float(self.settings.get('cursorYAxisSensitivity', 2.35))
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
        speed_multiplier = float(self.settings.get('cursorSpeedMultiplier', 0.5))
        speed_multiplier = max(0.1, min(1.0, speed_multiplier))
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
        return {
            'active': self.calibration_active,
            'targetIndex': self.calibration_index if self.calibration_active else None,
            'targets': self.calibration_targets,
            'progress': self._calibration_progress(),
            'result': self.calibration_result,
        }

    def _calibration_progress(self):
        if not self.calibration_active:
            return 0.0
        elapsed = time.perf_counter() - self.calibration_started_ts
        return min(1.0, elapsed / CALIBRATION_POINT_SECONDS)

    def _start_calibration(self):
        self.calibration_active = True
        self.calibration_index = 0
        self.calibration_started_ts = time.perf_counter()
        self.current_point_samples = []
        self.calibration_iris_samples = []
        self.calibration_screen_samples = []
        self.calibration_result = None

    def _cancel_calibration(self):
        self.calibration_active = False
        self.current_point_samples = []
        self.calibration_result = {'ok': False, 'message': 'Calibration cancelled'}

    def _advance_calibration(self, iris_vector):
        if not self.calibration_active:
            return

        now = time.perf_counter()
        self.current_point_samples.append((now, iris_vector.copy()))

        if now - self.calibration_started_ts < CALIBRATION_POINT_SECONDS:
            return

        if self.current_point_samples:
            settle_time = float(self.settings.get('calibrationSettleTime', 0.45))
            stable_samples = [
                sample
                for sample_ts, sample in self.current_point_samples
                if (sample_ts - self.calibration_started_ts) >= settle_time
            ]
            selected_samples = stable_samples if stable_samples else [s for _, s in self.current_point_samples]
            avg_sample = np.mean(np.vstack(selected_samples), axis=0)
        else:
            avg_sample = iris_vector

        self.calibration_iris_samples.append(avg_sample)
        self.calibration_screen_samples.append(self.calibration_targets[self.calibration_index])
        self.current_point_samples = []
        self.calibration_index += 1
        self.calibration_started_ts = now

        if self.calibration_index >= len(self.calibration_targets):
            self.calibration_active = False
            metrics = self.calibrator.fit(
                self.calibration_iris_samples,
                self.calibration_screen_samples,
            )
            max_dim = max(self.screen_w, self.screen_h)
            accuracy = max(0.0, 100.0 - (metrics['rmse'] / max_dim) * 100.0)
            self.calibration_result = {
                'ok': True,
                'accuracy': round(float(accuracy), 2),
                'rmse': round(metrics['rmse'], 2),
                'samples': metrics['sampleCount'],
            }

    def _save_profile(self, name):
        if not self.calibrator.fitted:
            return {'ok': False, 'error': 'No calibration data available'}

        name = name.strip()
        if not name:
            return {'ok': False, 'error': 'Profile name cannot be empty'}

        save_profile_model(name, self.calibrator.to_dict())

        profiles = self.profile_db.setdefault('profiles', {})
        profiles[name] = profiles.get(name, {})
        profiles[name]['settings'] = self.settings
        profiles[name]['updatedAt'] = int(time.time())
        self.profile_db['activeProfile'] = name
        self.active_profile = name
        save_profiles(self.profile_db)

        return {'ok': True, 'profile': name}

    def _load_profile(self, name):
        model_data = load_profile_model(name)
        if not model_data:
            return {'ok': False, 'error': f'Profile not found: {name}'}

        self.calibrator = PolynomialCalibrator.from_dict(model_data)
        self.active_profile = name
        self.profile_db['activeProfile'] = name

        profile_settings = self.profile_db.get('profiles', {}).get(name, {}).get('settings', {})
        self.settings.update(profile_settings)
        save_profiles(self.profile_db)
        return {'ok': True, 'profile': name}

    async def _broadcast(self, payload):
        if not self.clients:
            return

        encoded = json.dumps(payload)
        disconnected = []
        # iterate over a snapshot to avoid concurrent modification from other coroutines
        for ws in list(self.clients):
            try:
                await ws.send(encoded)
            except Exception:
                disconnected.append(ws)

        for ws in disconnected:
            try:
                self.clients.discard(ws)
            except Exception:
                pass

    async def _handle_message(self, data):
        msg_type = data.get('type')

        if msg_type == 'start_calibration':
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
                    'result': result,
                    'profiles': list(self.profile_db.get('profiles', {}).keys()),
                    'activeProfile': self.active_profile,
                }
            )

        elif msg_type == 'load_profile':
            result = self._load_profile(data.get('name', ''))
            await self._broadcast(
                {
                    'type': 'profiles',
                    'result': result,
                    'profiles': list(self.profile_db.get('profiles', {}).keys()),
                    'activeProfile': self.active_profile,
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
                    'profiles': list(self.profile_db.get('profiles', {}).keys()),
                    'activeProfile': self.active_profile,
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
                    'profiles': list(self.profile_db.get('profiles', {}).keys()),
                    'activeProfile': self.active_profile,
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

            if self.settings.get('demoMode', False):
                mx, my = pyautogui.position()
                self.cursor_x, self.cursor_y = self.kalman.step((mx, my), dt)
                self.dwell.progress = 0.0
                self.webcam_connected = False
                self.error_message = None
            else:
                if not self.mediapipe_ready:
                    self.error_message = self.mediapipe_error
                    self.webcam_connected = False
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
                    self.error_message = 'Webcam frame capture failed.'
                    self._close_webcam()
                    await asyncio.sleep(0.1)
                    continue

                self.webcam_connected = True
                self.preview_frame = self._encode_preview_frame(frame)
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
                    iris_vector = self._iris_vector(landmarks)
                    if not self._is_valid_iris_vector(iris_vector):
                        self.error_message = 'Gaze landmark drift detected. Hold gaze steady for a moment.'
                        self.dwell.progress = 0.0
                        await asyncio.sleep(0.01)
                        continue

                    self._advance_calibration(iris_vector)

                    self.cursor_x, self.cursor_y = self._predict_cursor(iris_vector, dt)
                    if not self.calibration_active:
                        pyautogui.moveTo(self.cursor_x, self.cursor_y, _pause=False)
                        actual_x, actual_y = pyautogui.position()
                        self.cursor_x = float(actual_x)
                        self.cursor_y = float(actual_y)

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
                    self.error_message = 'Face not detected. Center your face in the camera frame.'
                    self.dwell.progress = 0.0

            elapsed = time.perf_counter() - frame_start
            if elapsed > 0:
                self.fps = 1.0 / elapsed
            self.pipeline_latency_ms = elapsed * 1000.0

            payload = {
                'type': 'telemetry',
                'cursor': {'x': self.cursor_x, 'y': self.cursor_y},
                'dwellProgress': self.dwell.progress,
                'clickEvent': click_event,
                'previewFrame': self.preview_frame,
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
        return {
            'webcamConnected': self.webcam_connected,
            'calibrated': bool(self.calibrator.fitted),
            'fps': round(self.fps, 1),
            'latencyMs': round(self.pipeline_latency_ms, 2),
            'error': self.error_message,
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
