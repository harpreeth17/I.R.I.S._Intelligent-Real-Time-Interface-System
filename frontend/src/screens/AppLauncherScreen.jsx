import DwellableButton from '@/components/DwellableButton';

const APPS = [
  { id: 'browser', label: 'Browser', icon: 'WEB' },
  { id: 'fileManager', label: 'Files', icon: 'DIR' },
  { id: 'calculator', label: 'Calculator', icon: 'CALC' },
  { id: 'notepad', label: 'Notepad', icon: 'NOTE' },
  { id: 'media', label: 'VLC Media', icon: 'VLC' },
];

export default function AppLauncherScreen({ settings }) {
  const launch = async (appId) => {
    if (window.irisAPI?.launchApp) {
      await window.irisAPI.launchApp(appId);
    }
  };

  return (
    <section className="h-full rounded-3xl border border-sky-300/20 bg-[#101a31] p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-sky-100">App Launcher</h2>
          <p className="text-sm text-slate-300">Dwell on an icon for 1.5s to open an application.</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, index) => {
          const app = APPS[index];
          if (!app) {
            return <div key={`empty-${index}`} className="h-[120px] rounded-2xl border border-slate-700/40 bg-[#0f1930]/60" />;
          }

          return (
            <DwellableButton
              key={app.id}
              dwellDuration={settings.uiDwellDuration ?? 1.0}
              repeatCooldown={settings.uiRepeatCooldown ?? 1.2}
              onDwell={() => launch(app.id)}
              onClick={() => launch(app.id)}
              className="flex h-[120px] flex-col items-center justify-center"
              minSizeClass="min-h-[120px] min-w-[120px]"
            >
              <div className="text-lg font-semibold tracking-wide">{app.icon}</div>
              <div className="mt-2 text-sm text-slate-100">{app.label}</div>
            </DwellableButton>
          );
        })}
      </div>
    </section>
  );
}
