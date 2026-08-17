import type { ComponentType } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { ROLE_LABEL, type Role } from '../auth/auth';
import { btn, btnQuiet, glass } from '../ui';
import { FilmIcon, PlusIcon, ScanIcon, TicketIcon, UserIcon } from '../icons';

type NavItem = { to: string; label: string; Icon: ComponentType<{ size?: number }> };

const NAV_BY_ROLE: Record<Role | 'GUEST', ReadonlyArray<NavItem>> = {
  GUEST: [{ to: '/events', label: 'Eventos', Icon: FilmIcon }],
  CUSTOMER: [
    { to: '/events', label: 'Eventos', Icon: FilmIcon },
    { to: '/tickets', label: 'Ingressos', Icon: TicketIcon },
  ],
  ORGANIZER: [{ to: '/events', label: 'Eventos', Icon: FilmIcon }],
  DOOR: [{ to: '/door', label: 'Validar', Icon: ScanIcon }],
};

/** A foto do teatro só entra no cartaz e na sessão. */
export function isStageRoute(pathname: string) {
  return pathname === '/events' || (pathname.startsWith('/events/') && pathname !== '/events/new');
}

const barTab = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 text-sm font-bold ${
    isActive ? 'bg-surface-top text-ink' : 'text-faint hover:text-ink'
  }`;

const bottomTab = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs font-bold ${
    isActive ? 'text-lavender' : 'text-faint'
  }`;

function BrandMark({ labelled = false }: { labelled?: boolean }) {
  const { session } = useAuth();

  return (
    <div className="grid min-w-0 gap-0.5">
      <Link to="/" className="truncate font-extrabold tracking-tight text-ink hover:text-ink">
        Elite Eventos
      </Link>
      {session ? (
        <p
          className="m-0 truncate text-[13px] text-faint"
          {...(labelled ? { 'aria-label': 'sessão' } : {})}
        >
          {session.user.name} · {ROLE_LABEL[session.user.role]}
        </p>
      ) : null}
    </div>
  );
}

function ChromeAction({ allowGuest = false }: { allowGuest?: boolean }) {
  const { session } = useAuth();
  const { pathname } = useLocation();

  if (!session) {
    if (!allowGuest) return null;
    return (
      <Link className={`${btn} min-h-10 px-4 text-sm whitespace-nowrap`} to="/login">
        Entrar
      </Link>
    );
  }

  if (session.user.role !== 'ORGANIZER') return null;

  if (pathname === '/events/new') {
    return (
      <button
        className={`${btn} min-h-10 px-4 text-sm whitespace-nowrap`}
        form="publish-session"
        type="submit"
      >
        Publicar
      </button>
    );
  }

  if (pathname === '/' || pathname.startsWith('/events')) {
    /* No mobile o rótulo sai e fica só o "+": com o texto, o botão quebrava em
       duas linhas e engolia a marca. O nome acessível continua o mesmo. */
    return (
      <Link
        className={`${btn} min-h-10 shrink-0 gap-1.5 px-3 text-sm whitespace-nowrap sm:px-4`}
        to="/events/new"
        aria-label="Nova sessão"
      >
        <PlusIcon size={18} />
        <span className="hidden sm:inline">Nova sessão</span>
      </Link>
    );
  }

  return null;
}

export function Shell() {
  const { session, logout } = useAuth();
  const { pathname } = useLocation();
  const items = NAV_BY_ROLE[session?.user.role ?? 'GUEST'];
  const stage = isStageRoute(pathname);

  return (
    <div className={stage ? 'relative min-h-dvh' : 'flex min-h-dvh flex-col'}>
      <header
        className={`${stage ? 'absolute' : 'sticky'} inset-x-0 top-0 z-20 hidden p-3 md:block md:px-6 md:pt-4`}
      >
        <div
          className={`${glass} mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-full px-4 py-2.5`}
        >
          <BrandMark labelled />
          <nav className="flex items-center gap-1">
            {items.map((item) => (
              <NavLink key={item.to} className={barTab} to={item.to}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center justify-end gap-2">
            <ChromeAction allowGuest />
            {session ? (
              <button
                type="button"
                className={`${btnQuiet} min-h-10 text-sm`}
                onClick={() => void logout()}
              >
                Sair
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <header className={`${stage ? 'absolute' : ''} inset-x-0 top-0 z-20 p-3 md:hidden`}>
        <div className={`${glass} flex items-center justify-between gap-3 rounded-full px-4 py-2`}>
          <BrandMark />
          <ChromeAction />
        </div>
      </header>

      <main
        className={
          stage
            ? /* Header flutua sobre a foto: o CinemaStage já reserva o topo. */
              'min-h-dvh w-full pb-24 md:pb-0'
            : /* Header é sticky e ocupa espaço no fluxo — somar pt aqui dobrava
                 a distância até o título da página. */
              'mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-28 md:px-6 md:pt-6 md:pb-12'
        }
      >
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-line bg-surface/95 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden">
        {items.map((item) => (
          <NavLink key={item.to} className={bottomTab} to={item.to}>
            <item.Icon size={22} />
            {item.label}
          </NavLink>
        ))}
        {session ? (
          <button
            type="button"
            className="flex min-h-14 flex-1 cursor-pointer flex-col items-center justify-center gap-1 border-0 bg-transparent text-xs font-bold text-faint"
            onClick={() => void logout()}
          >
            <UserIcon size={22} />
            Sair
          </button>
        ) : (
          <Link
            className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs font-bold text-lavender hover:text-lavender"
            to="/login"
          >
            <UserIcon size={22} />
            Entrar
          </Link>
        )}
      </nav>
    </div>
  );
}
