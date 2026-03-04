export default function EmptyState({ title, subtitle, action = null }) {
  return (
    <div className="card-surface p-6 text-center">
      <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-primary/10 text-primary">
        <div className="grid h-full place-items-center text-2xl">◌</div>
      </div>
      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{subtitle}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

