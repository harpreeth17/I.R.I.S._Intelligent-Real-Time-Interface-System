export default function SettingsScreen({ settings, onSettingsChange, profiles, activeProfile, onLoadProfile, send }) {
  const update = (patch) => onSettingsChange(patch);

  return (
    <section className="space-y-5 rounded-3xl border border-sky-300/20 bg-[#101a31] p-6">
      <div>
        <h2 className="text-xl font-semibold text-sky-100">Settings</h2>
        <p className="text-sm text-slate-300">Tune selection speed, blink sensitivity, cursor behavior, and profile preferences.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-sky-300/20 bg-[#0b1226] p-4">
        <label className="text-sm text-slate-200">
          Webcam source
          <select
            value={settings.webcamMode || 'auto'}
            onChange={(e) => update({ webcamMode: e.target.value })}
            className="mt-2 w-full rounded-xl border border-sky-300/20 bg-[#0f1930] px-3 py-2 text-slate-100"
          >
            <option value="auto">Auto detect</option>
            <option value="laptop">Laptop webcam</option>
            <option value="external">External webcam</option>
          </select>
          <p className="mt-2 text-xs text-slate-400">Auto detect rescans periodically and switches to a plugged-in external camera when available.</p>
        </label>

        <label className="text-sm text-slate-200">
          Mouse dwell duration: {settings.dwellDuration}s
          <input
            type="range"
            min="0.3"
            max="2.0"
            step="0.05"
            value={settings.dwellDuration}
            onChange={(e) => update({ dwellDuration: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>

        <label className="text-sm text-slate-200">
          Mouse dwell radius: {settings.dwellRadius}px
          <input
            type="range"
            min="20"
            max="120"
            step="1"
            value={settings.dwellRadius}
            onChange={(e) => update({ dwellRadius: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>

        <label className="text-sm text-slate-200">
          Mouse click cooldown: {settings.clickCooldown}s
          <input
            type="range"
            min="0.3"
            max="3.0"
            step="0.1"
            value={settings.clickCooldown}
            onChange={(e) => update({ clickCooldown: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>

        <label className="text-sm text-slate-200">
          UI dwell duration: {settings.uiDwellDuration}s
          <input
            type="range"
            min="0.3"
            max="3.0"
            step="0.1"
            value={settings.uiDwellDuration}
            onChange={(e) => update({ uiDwellDuration: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>

        <label className="text-sm text-slate-200">
          UI repeat cooldown: {settings.uiRepeatCooldown}s
          <input
            type="range"
            min="0.2"
            max="3.0"
            step="0.1"
            value={settings.uiRepeatCooldown}
            onChange={(e) => update({ uiRepeatCooldown: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={settings.demoMode}
            onChange={(e) => {
              update({ demoMode: e.target.checked });
              send({ type: 'set_demo_mode', enabled: e.target.checked });
            }}
          />
          Demo mode (mouse simulation)
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-sky-300/20 bg-[#0b1226] p-4">
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={settings.blinkClickEnabled}
            onChange={(e) => update({ blinkClickEnabled: e.target.checked })}
          />
          Enable blink click
        </label>

        <label className="text-sm text-slate-200">
          Blink EAR threshold: {settings.blinkThreshold}
          <input
            type="range"
            min="0.12"
            max="0.35"
            step="0.01"
            value={settings.blinkThreshold}
            onChange={(e) => update({ blinkThreshold: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>

        <label className="text-sm text-slate-200">
          Blink hold duration: {settings.blinkMinDuration}s
          <input
            type="range"
            min="0.08"
            max="0.5"
            step="0.01"
            value={settings.blinkMinDuration}
            onChange={(e) => update({ blinkMinDuration: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>

        <label className="text-sm text-slate-200">
          Calibration settle time: {settings.calibrationSettleTime}s
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={settings.calibrationSettleTime}
            onChange={(e) => update({ calibrationSettleTime: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-sky-300/20 bg-[#0b1226] p-4">
        <label className="text-sm text-slate-200">
          Cursor scale X: {settings.cursorScaleX}
          <input
            type="range"
            min="0.8"
            max="2.0"
            step="0.05"
            value={settings.cursorScaleX}
            onChange={(e) => update({ cursorScaleX: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>

        <label className="text-sm text-slate-200">
          Cursor scale Y: {settings.cursorScaleY}
          <input
            type="range"
            min="0.8"
            max="2.0"
            step="0.05"
            value={settings.cursorScaleY}
            onChange={(e) => update({ cursorScaleY: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>

        <label className="text-sm text-slate-200">
          Left axis gain: {settings.cursorGainLeft}
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            value={settings.cursorGainLeft}
            onChange={(e) => update({ cursorGainLeft: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>

        <label className="text-sm text-slate-200">
          Right axis gain: {settings.cursorGainRight}
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            value={settings.cursorGainRight}
            onChange={(e) => update({ cursorGainRight: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>

        <label className="text-sm text-slate-200">
          Up axis gain: {settings.cursorGainUp}
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            value={settings.cursorGainUp}
            onChange={(e) => update({ cursorGainUp: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>

        <label className="text-sm text-slate-200">
          Down axis gain: {settings.cursorGainDown}
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            value={settings.cursorGainDown}
            onChange={(e) => update({ cursorGainDown: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>

        <label className="text-sm text-slate-200">
          Max cursor speed: {settings.maxCursorSpeed}px/s
          <input
            type="range"
            min="400"
            max="3500"
            step="50"
            value={settings.maxCursorSpeed}
            onChange={(e) => update({ maxCursorSpeed: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>

        <label className="text-sm text-slate-200">
          Iris smoothing alpha: {settings.irisSmoothingAlpha}
          <input
            type="range"
            min="0.1"
            max="0.9"
            step="0.05"
            value={settings.irisSmoothingAlpha}
            onChange={(e) => update({ irisSmoothingAlpha: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={settings.invertXAxis}
            onChange={(e) => update({ invertXAxis: e.target.checked })}
          />
          Invert X axis
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={settings.invertYAxis}
            onChange={(e) => update({ invertYAxis: e.target.checked })}
          />
          Invert Y axis
        </label>

        <label className="text-sm text-slate-200">
          Cursor offset X: {settings.cursorOffsetX}px
          <input
            type="range"
            min="-400"
            max="400"
            step="5"
            value={settings.cursorOffsetX}
            onChange={(e) => update({ cursorOffsetX: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>

        <label className="text-sm text-slate-200">
          Cursor offset Y: {settings.cursorOffsetY}px
          <input
            type="range"
            min="-400"
            max="400"
            step="5"
            value={settings.cursorOffsetY}
            onChange={(e) => update({ cursorOffsetY: Number(e.target.value) })}
            className="mt-2 w-full"
          />
        </label>
      </div>

      <div className="rounded-2xl border border-sky-300/20 bg-[#0b1226] p-4">
        <p className="mb-2 text-sm text-slate-300">Active profile: {activeProfile || 'None'}</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {profiles.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onLoadProfile(name)}
              className={`min-h-[52px] rounded-xl border px-3 text-sm ${
                name === activeProfile
                  ? 'border-teal-300/40 bg-teal-300/20 text-teal-100'
                  : 'border-sky-300/25 bg-sky-300/10 text-slate-200'
              }`}
            >
              {name}
            </button>
          ))}
          {profiles.length === 0 && <p className="text-sm text-slate-400">No saved profiles yet. Calibrate and save from Calibration screen.</p>}
        </div>
      </div>
    </section>
  );
}
