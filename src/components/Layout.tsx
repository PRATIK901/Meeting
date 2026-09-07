import { Link, NavLink, Outlet } from 'react-router-dom';

import { useSession } from '../hooks/useSession';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200',
  ].join(' ');

export function Layout() {
  const { admin, signOut } = useSession();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="text-base font-semibold tracking-tight">
            Meeting Attendance
          </Link>
          <nav className="flex gap-1">
            <NavLink to="/" end className={navLinkClass}>
              Meetings
            </NavLink>
            <NavLink to="/qr" className={navLinkClass}>
              QR codes
            </NavLink>
            {/* Admin links appear only for a signed-in session. They are a
                convenience, not a control: the routes themselves are guarded,
                and the server re-checks the session cookie on every request. */}
            {admin && (
              <>
                <NavLink to="/admin" end className={navLinkClass}>
                  Dashboard
                </NavLink>
                <NavLink to="/admin/reports" className={navLinkClass}>
                  Reports
                </NavLink>
                <NavLink to="/admin/export" className={navLinkClass}>
                  Export
                </NavLink>
                <NavLink to="/admin/meetings" className={navLinkClass}>
                  Meetings
                </NavLink>
                <NavLink to="/admin/people" className={navLinkClass}>
                  People
                </NavLink>
              </>
            )}
            {!admin && (
              <NavLink to="/admin" className={navLinkClass}>
                Admin
              </NavLink>
            )}
            {admin && (
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-200"
              >
                Sign out
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
