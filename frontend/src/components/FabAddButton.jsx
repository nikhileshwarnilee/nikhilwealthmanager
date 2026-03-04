import { Link } from 'react-router-dom';
import Icon from './Icon';

export default function FabAddButton() {
  return (
    <Link
      to="/transactions/new"
      className="fixed bottom-[66px] left-1/2 z-50 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full bg-gradient-to-br from-primary to-violet-600 text-white shadow-2xl transition-transform hover:scale-105 active:scale-95"
      aria-label="Add transaction"
    >
      <Icon name="plus" size={24} />
    </Link>
  );
}
