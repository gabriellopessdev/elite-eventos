import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { ROLE_LABEL, type Role } from '../auth/auth';
import { chromeBar, chromeBtn, chromeBtnGhost } from '../ui';

const NAV_BY_ROLE: Record<Role | 'GUEST', ReadonlyArray<{ to: string; label: string }>> = {
  GUEST: [{ to: '/events', label: 'Eventos' }],
  CUSTOMER: [
    { to: '/events', label: 'Eventos' },
    { to: '/tickets', label: 'Ingressos' },
  ],
  ORGANIZER: [{ to: '/events', label: 'Eventos' }],
  DOOR: [{ to: '/door', label: 'Validar' }],
};

const navTabClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center gap-1 text-[11px] font-bold ${
    isActive ? 'text-accent' : 'text-muted hover:text-accent'
  }`;

const navBarClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'rounded-lg border border-white/10 bg-black/45 px-4 py-2 text-sm font-bold text-[#c4b5ff]'
    : 'rounded-lg px-4 py-2 text-sm font-bold text-white/45 hover:text-white';

function NavItems({ variant }: { variant: 'tab' | 'bar' }) {
  const { session } = useAuth();
  const items = NAV_BY_ROLE[session?.user.role ?? 'GUEST'];
  const className = variant === 'tab' ? navTabClass : navBarClass;

  return (
    <>
      {items.map((item) => (
        <NavLink key={item.to} className={className} to={item.to}>
          {item.label}
        </NavLink>
      ))}
    </>
  );
}

function ChromeAction({ allowGuest = false }: { allowGuest?: boolean }) {
  const { session } = useAuth();
  const { pathname } = useLocation();

  if (!session) {
    if (!allowGuest) return null;
    return (
      <Link className={chromeBtn} to="/login">
        Entrar
      </Link>
    );
  }

  if (session.user.role === 'ORGANIZER' && pathname === '/events/new') {
    return (
      <button className={chromeBtn} form="publish-session" type="submit">
        Publicar
      </button>
    );
  }

  if (
    session.user.role === 'ORGANIZER' &&
    pathname !== '/events/new' &&
    (pathname === '/' || pathname.startsWith('/events'))
  ) {
    return (
      <Link className={chromeBtn} to="/events/new">
        <span aria-hidden="true">+</span>
        Nova sessão
      </Link>
    );
  }

  return null;
}
function SessionMeta({ labelled = false }: { labelled?: boolean }) {
  const { session } = useAuth();
  if (!session) return null;

  return (
    <p
      className="m-0 truncate text-xs font-semibold text-white/50"
      {...(labelled ? { 'aria-label': 'sessão' } : {})}
    >
      {session.user.name} · {ROLE_LABEL[session.user.role]}
    </p>
  );
}

function BrandMark({ labelled = false }: { labelled?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="grid min-w-0 gap-0.5">
        <Link to="/" className="truncate text-base font-extrabold tracking-tight text-white">
          Elite Eventos
        </Link>
        <SessionMeta labelled={labelled} />
      </div>
    </div>
  );
}

function SessionChip() {
  const { session, logout } = useAuth();
  if (!session) return null;

  return (
    <button
      type="button"
      className={`${chromeBtnGhost} min-h-10 px-4 py-2 text-sm`}
      onClick={() => void logout()}
    >
      Sair
    </button>
  );
}

export function Shell() {
  const { session, logout } = useAuth();
  const { pathname } = useLocation();
  const flushCinema =
    pathname === '/' || pathname.startsWith('/events') || pathname === '/tickets';

  return (
    <div className={flushCinema ? 'relative min-h-dvh' : 'flex min-h-dvh flex-col'}>
      <header
        className={
          flushCinema
            ? 'absolute inset-x-0 top-0 z-20 hidden p-3 md:block md:px-6 md:pt-4'
            : 'sticky top-0 z-10 hidden p-3 md:block md:px-6 md:pt-4'
        }
      >
        <div
          className={`${chromeBar} mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 py-2.5`}
        >
          <BrandMark labelled />
          <nav className="flex items-center gap-1">
            <NavItems variant="bar" />
          </nav>
          <div className="flex items-center justify-end gap-2">
            <ChromeAction allowGuest />
            <SessionChip />
          </div>
        </div>
      </header>

      <header
        className={flushCinema ? 'absolute inset-x-0 top-0 z-20 p-3 md:hidden' : 'p-3 md:hidden'}
      >
        <div className={`${chromeBar} flex items-center justify-between gap-3 px-3 py-2`}>
          <BrandMark />
          <ChromeAction />
        </div>
      </header>

      <main
        className={
          flushCinema
            ? 'min-h-dvh w-full pb-24 md:pb-0'
            : 'mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-24 md:px-6 md:py-10 md:pb-12'
        }
      >
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-line bg-surface/95 px-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden">
        <NavItems variant="tab" />
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
