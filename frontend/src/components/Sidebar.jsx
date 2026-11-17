const items = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'calibration', label: 'Calibration' },
  { id: 'keyboard', label: 'Gaze Keyboard' },
  { id: 'launcher', label: 'App Launcher' },
  { id: 'profiles', label: 'Profiles' },
  { id: 'settings', label: 'Settings' },
];

export default function Sidebar({ active, onChange }) {
  return (
    <aside className="flex w-64 flex-col border-r border-sky-300/15 bg-[#0b1327] p-4">
      <p className="iris-status mb-4 uppercase tracking-[0.25em] text-slate-400">Navigation</p>
      <div className="space-y-3">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`iris-button iris-button-navigation iris-nav-label min-h-[80px] w-full rounded-2xl border px-4 text-left transition ${
              active === item.id
                ? 'border-sky-300/45 bg-sky-300/10 text-sky-100 shadow-glow'
                : 'border-transparent bg-[#111f3d] text-slate-300 hover:border-sky-300/30 hover:text-sky-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
