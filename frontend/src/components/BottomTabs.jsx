import { NavLink } from 'react-router-dom';
import Icon from './Icon';

const tabs = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/transactions', label: 'Transactions', icon: 'transactions' },
  { to: '/transactions/new', label: 'Add', icon: 'plus' },
  { to: '/accounts', label: 'Accounts', icon: 'accounts' },
  { to: '/assets', label: 'Wealth', icon: 'asset' },
  { to: '/charts', label: 'Charts', icon: 'chart' }
];

export default function BottomTabs() {
  return (
    <nav className="safe-bottom z-40 w-full border-t border-slate-200/80 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="grid grid-cols-6">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-all ${
                isActive ? 'text-primary' : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <Icon name={tab.icon} size={16} />
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
