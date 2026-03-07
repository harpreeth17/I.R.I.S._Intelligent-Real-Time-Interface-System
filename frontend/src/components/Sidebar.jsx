const items = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'calibration', label: 'Calibration' },
  { id: 'keyboard', label: 'Gaze Keyboard' },
  { id: 'launcher', label: 'App Launcher' },
  { id: 'settings', label: 'Settings' },
];

export default function Sidebar({ active, onChange }) {
  return (
    <aside className="flex w-64 flex-col border-r border-sky-300/15 bg-[#0b1327] p-4">
      <p className="mb-4 text-xs uppercase tracking-[0.25em] text-slate-400">Navigation</p>
      <div className="space-y-3">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`min-h-[80px] w-full rounded-2xl border px-4 text-left text-base transition ${
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
