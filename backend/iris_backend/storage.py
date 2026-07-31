import json
import pickle
from pathlib import Path

from .config import PROFILES_DIR, PROFILES_JSON


DEFAULT_SETTINGS = {
    'dwellDuration': 0.8,
    'dwellRadius': 50,
    'clickCooldown': 1.0,
    'uiDwellDuration': 0.9,
    'uiRepeatCooldown': 1.1,
    'blinkClickEnabled': True,
    'blinkThreshold': 0.20,
    'blinkMinDuration': 0.15,
    'cursorScaleX': 1.15,
    'cursorScaleY': 1.15,
    'cursorGainLeft': 0.9,
    'cursorGainRight': 1.35,
    'cursorGainUp': 1.5,
    'cursorGainDown': 1.35,
    'cursorYAxisSensitivity': 2.35,
    'irisMotionScaleX': 1.45,
    'irisMotionScaleY': 2.2,
    'invertXAxis': True,
    'invertYAxis': False,
    'maxCursorSpeed': 1600,
    'cursorSpeedMultiplier': 0.5,
    'irisSmoothingAlpha': 0.28,
    'cursorOffsetX': 0,
    'cursorOffsetY': 0,
    'calibrationSettleTime': 0.45,
    'webcamMode': 'auto',
    'demoMode': False,
}


def ensure_storage() -> None:
    PROFILES_DIR.mkdir(parents=True, exist_ok=True)
    if not PROFILES_JSON.exists():
        with PROFILES_JSON.open('w', encoding='utf-8') as f:
            json.dump({'activeProfile': None, 'profiles': {}}, f, indent=2)


def load_profiles() -> dict:
    ensure_storage()
    with PROFILES_JSON.open('r', encoding='utf-8') as f:
        data = json.load(f)
    data.setdefault('activeProfile', None)
    data.setdefault('profiles', {})
    return data


def save_profiles(data: dict) -> None:
    ensure_storage()
    with PROFILES_JSON.open('w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)


def profile_model_path(profile_name: str) -> Path:
    return PROFILES_DIR / f'{profile_name}.pkl'


def save_profile_model(profile_name: str, model_data: dict) -> None:
    path = profile_model_path(profile_name)
    with path.open('wb') as f:
        pickle.dump(model_data, f)


def load_profile_model(profile_name: str) -> dict | None:
    path = profile_model_path(profile_name)
    if not path.exists():
        return None
    with path.open('rb') as f:
        return pickle.load(f)
