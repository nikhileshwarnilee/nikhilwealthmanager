import { useEffect, useState } from 'react';

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };

    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!installEvent || installed) {
    return null;
  }

  const onInstall = async () => {
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  return (
    <div className="card-surface flex items-center justify-between gap-2 rounded-xl p-2">
      <div>
        <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Install App</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">Add Expense Manager to home screen.</p>
      </div>
      <button
        type="button"
        className="rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-white"
        onClick={onInstall}
      >
        Install
      </button>
    </div>
  );
}
