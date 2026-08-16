import { Link, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { useAuth } from './auth/useAuth';
import { ROLE_LABEL } from './auth/auth';
import { LoginPage } from './LoginPage';
import { Home } from './Home';
import { btn, btnGhost, island } from './ui';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center gap-1 text-[11px] font-bold md:flex-none md:text-sm ${
    isActive ? 'text-accent' : 'text-muted hover:text-accent'
  }`;

function NavItems() {
  const { session } = useAuth();

  return (
    <>
      <NavLink className={navClass} to="/events">
        Eventos
      </NavLink>
      {session ? (
        <>
          <NavLink className={navClass} to="/tickets">
            Ingressos
          </NavLink>
          <NavLink className={navClass} to="/door">
            Portaria
          </NavLink>
        </>
      ) : null}
    </>
  );
}

function Shell() {
  const { session, logout } = useAuth();
  const { pathname } = useLocation();
  const flushHome = pathname === '/';

  return (
    <div className={flushHome ? 'relative min-h-dvh' : 'flex min-h-dvh flex-col'}>
      <header
        className={
          flushHome
            ? 'absolute inset-x-0 top-0 z-20 hidden p-3 md:block md:px-6 md:pt-4'
            : 'sticky top-0 z-10 hidden p-3 md:block md:px-6 md:pt-4'
        }
      >
        <div
          className={`${island} mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3`}
        >
          <Link to="/" className="text-lg font-extrabold tracking-tight text-brand">
            Elite Eventos
          </Link>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <NavItems />
            {session ? (
              <span
                className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink"
                aria-label="sessão"
              >
                <span>
                  {session.user.name} · {ROLE_LABEL[session.user.role]}
                </span>
                <button type="button" className={btnGhost} onClick={() => void logout()}>
                  Sair
                </button>
              </span>
            ) : (
              <Link className={`${btn} min-h-10 px-4 py-2 text-sm`} to="/login">
                Entrar
              </Link>
            )}
          </nav>
        </div>
      </header>

      <header
        className={
          flushHome
            ? 'absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3 md:hidden'
            : 'flex items-center justify-between px-4 py-3 md:hidden'
        }
      >
        <Link
          to="/"
          className={`text-lg font-extrabold tracking-tight ${flushHome ? 'text-white' : 'text-brand'}`}
        >
          Elite Eventos
        </Link>
        {session ? (
          <span
            className={`truncate text-xs font-semibold ${flushHome ? 'text-white/80' : 'text-muted'}`}
          >
            {session.user.name} · {ROLE_LABEL[session.user.role]}
          </span>
        ) : null}
      </header>

      <main
        className={
          flushHome
            ? 'min-h-dvh w-full pb-24 md:pb-0'
            : 'mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-24 md:px-6 md:py-10 md:pb-12'
        }
      >
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-line bg-surface/95 px-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden">
        <NavItems />
        {session ? (
          <button
            type="button"
            className="flex flex-1 flex-col items-center gap-1 text-[11px] font-bold text-muted"
            onClick={() => void logout()}
          >
            Sair
          </button>
        ) : (
          <Link
            className="flex flex-1 flex-col items-center gap-1 text-[11px] font-bold text-accent"
            to="/login"
          >
            Entrar
          </Link>
        )}
      </nav>
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <section className={`${island} grid max-w-lg gap-2 p-6 md:p-8`}>
      <h1 className="m-0 text-2xl font-extrabold text-brand">{title}</h1>
      <p className="m-0 text-muted">Próximas fatias do roadmap.</p>
    </section>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Shell />}>
        <Route path="/" element={<Home />} />
        <Route path="/events" element={<Placeholder title="Eventos" />} />
        <Route path="/tickets" element={<Placeholder title="Meus ingressos" />} />
        <Route path="/door" element={<Placeholder title="Portaria" />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
