import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Server, Archive, Calendar, Settings, HardDrive } from 'lucide-react';
import { clsx } from 'clsx';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/servers', label: 'Servers', icon: Server },
  { to: '/snapshots', label: 'Snapshots', icon: Archive },
  { to: '/schedules', label: 'Schedules', icon: Calendar },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  return (
    <nav className="w-56 flex-shrink-0 bg-[hsl(222,47%,9%)] border-r border-[hsl(222,47%,20%)] flex flex-col">
      <div className="flex items-center gap-2 px-4 py-5 border-b border-[hsl(222,47%,20%)]">
        <HardDrive className="w-6 h-6 text-[hsl(217,91%,60%)]" />
        <span className="font-semibold text-sm leading-tight">VPS Snapshot<br/>Manager</span>
      </div>

      <ul className="flex-1 py-4 space-y-1 px-2">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-[hsl(217,91%,60%,0.15)] text-[hsl(217,91%,70%)] font-medium'
                    : 'text-[hsl(215,20%,60%)] hover:text-[hsl(210,40%,98%)] hover:bg-[hsl(222,47%,18%)]',
                )
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="px-4 py-3 border-t border-[hsl(222,47%,20%)] text-xs text-[hsl(215,20%,45%)]">
        v0.1.0
      </div>
    </nav>
  );
}
