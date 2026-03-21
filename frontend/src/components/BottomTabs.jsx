import { NavLink } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { isModuleEnabled } from '../utils/modules';
import { hasFeatureAccess } from '../utils/permissions';
import Icon from './Icon';

const tabs = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/transactions', label: 'Transactions', icon: 'transactions' },
  { to: '/transactions/new', label: 'Add', icon: 'plus' },
  { to: '/accounts', label: 'Accounts', icon: 'accounts' },
  { to: '/ledger', label: 'Ledger', icon: 'ledger', moduleKey: 'ledger' },
  { to: '/assets', label: 'Wealth', icon: 'asset' },
  { to: '/charts', label: 'Charts', icon: 'chart' }
];

export default function BottomTabs() {
  const { user, settings } = useAuth();
  const ledgerEnabled = isModuleEnabled(settings, 'ledger');
  const assetsEnabled = isModuleEnabled(settings, 'assets');
  const transactionsEnabled = hasFeatureAccess(user, 'transactions');
  const accountsEnabled = hasFeatureAccess(user, 'accounts');
  const chartsEnabled = hasFeatureAccess(user, 'charts');
  const visibleTabs = tabs.filter((tab) => {
    if ((tab.to === '/transactions' || tab.to === '/transactions/new') && !transactionsEnabled) return false;
    if (tab.to === '/accounts' && !accountsEnabled) return false;
    if (tab.to === '/charts' && !chartsEnabled) return false;
    if (tab.moduleKey === 'ledger') return ledgerEnabled;
    if (tab.to === '/assets') return assetsEnabled;
    return true;
  });
  const denseLayout = visibleTabs.length >= 7;

  return (
    <nav className="safe-bottom z-40 w-full border-t border-slate-200/80 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}>
        {visibleTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 text-center font-semibold leading-tight transition-all ${
                denseLayout ? 'text-[9px]' : 'text-[10px]'
              } ${
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
