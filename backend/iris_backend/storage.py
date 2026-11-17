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
    'cursorYAxisSensitivity': 1.0,
    'irisMotionScaleX': 1.45,
    'irisMotionScaleY': 2.2,
    'invertXAxis': True,
    'invertYAxis': False,
    'maxCursorSpeed': 3200,
    'cursorSpeedMultiplier': 1.0,
    'irisSmoothingAlpha': 0.45,
    'cursorOffsetX': 0,
    'cursorOffsetY': 0,
    'calibrationSettleTime': 0.45,
    'webcamMode': 'auto',
    'interfaceFontSize': 'large',
    'displayContrast': 'standard',
    'textDisplay': 'large',
    'preferredTheme': 'dark',
    'demoMode': False,
}


def normalize_profile_name(profile_name: str) -> str:
    if not isinstance(profile_name, str):
        raise ValueError('Profile name must be text')

    name = profile_name.strip()
    if not name or name in {'.', '..'} or len(name) > 64:
        raise ValueError('Profile name must be 1-64 characters')
    if any(character in name for character in '\x00\\/:*?"<>|'):
        raise ValueError('Profile name contains invalid characters')
    if name.endswith('.') or name.endswith(' '):
        raise ValueError('Profile name cannot end with a space or period')
    return name


def ensure_storage() -> None:
    PROFILES_DIR.mkdir(parents=True, exist_ok=True)
    if not PROFILES_JSON.exists():
        with PROFILES_JSON.open('w', encoding='utf-8') as f:
            json.dump({'activeProfile': None, 'profiles': {}}, f, indent=2)


def load_profiles() -> dict:
    ensure_storage()
    try:
        with PROFILES_JSON.open('r', encoding='utf-8') as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as error:
        print(f'I.R.I.S: profile metadata could not be loaded: {error}')
        return {'activeProfile': None, 'profiles': {}}
    if not isinstance(data, dict):
        print('I.R.I.S: profile metadata has an invalid structure')
        return {'activeProfile': None, 'profiles': {}}
    data.setdefault('activeProfile', None)
    if not isinstance(data.get('profiles'), dict):
        print('I.R.I.S: profile metadata contains an invalid profile list')
        data['profiles'] = {}
    return data


def save_profiles(data: dict) -> None:
    ensure_storage()
    with PROFILES_JSON.open('w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)


def profile_model_path(profile_name: str) -> Path:
    return PROFILES_DIR / f'{normalize_profile_name(profile_name)}.pkl'


def save_profile_model(profile_name: str, model_data: dict) -> None:
    path = profile_model_path(profile_name)
    with path.open('wb') as f:
        pickle.dump(model_data, f)


def load_profile_model(profile_name: str) -> dict | None:
    try:
        path = profile_model_path(profile_name)
    except ValueError:
        return None
    if not path.exists():
        return None
    try:
        with path.open('rb') as f:
            model_data = pickle.load(f)
    except (OSError, EOFError, pickle.UnpicklingError, AttributeError, ImportError, ValueError):
        return None
    return model_data if isinstance(model_data, dict) else None
