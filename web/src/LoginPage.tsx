import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthError, DEMO_ACCOUNTS, ROLE_LABEL } from './auth/auth';
import { useAuth } from './auth/useAuth';
import { btn, chipActive, chipIdle, fieldInput } from './ui';

export function LoginPage() {
  const { login, session } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const filledDemo = DEMO_ACCOUNTS.find((account) => account.email === email);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(
        err instanceof AuthError && err.status === 401
          ? 'E-mail ou senha inválidos'
          : 'Não foi possível entrar',
      );
    } finally {
      setPending(false);
    }
  }

  if (session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-page p-6">
        <section className="grid w-full max-w-md gap-4 rounded-2xl bg-surface p-8 shadow-island">
          <h1 className="m-0 text-2xl font-extrabold text-brand">Você já entrou</h1>
          <p className="m-0 text-muted">
            {session.user.name} · {ROLE_LABEL[session.user.role]}
          </p>
          <Link className={btn} to="/">
            Continuar
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-page md:flex-row">
      <aside className="relative flex min-h-52 flex-col justify-end overflow-hidden px-6 py-8 md:min-h-dvh md:flex-1 md:px-14 md:py-14">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 90% 70% at 10% 100%, rgb(105 101 219 / 0.55), transparent 55%), radial-gradient(ellipse 60% 50% at 100% 0%, rgb(241 240 255 / 0.22), transparent 50%), linear-gradient(160deg, #190064 0%, #4a47b1 52%, #6965db 100%)',
          }}
        />
        <div className="relative max-w-sm">
          <p className="m-0 text-xs font-bold tracking-[0.16em] text-white/70 uppercase">
            Lugar marcado
          </p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white md:text-6xl md:leading-[0.95]">
            Elite Eventos
          </h1>
          <p className="mt-4 max-w-[22rem] text-[15px] leading-relaxed text-white/75">
            Ingresso sem fila e sem letra miúda. Escolha o assento, pague e entre pela portaria.
          </p>
        </div>
      </aside>

      <section className="flex flex-1 flex-col justify-center gap-6 px-6 py-10 md:px-16 md:py-14">
        <div className="mx-auto grid w-full max-w-md gap-6">
          <div>
            <h2 className="m-0 text-xl font-extrabold text-brand">Entrar</h2>
            <p className="mt-1 text-sm text-muted">
              Os atalhos só preenchem o seed. O papel vem da conta.
            </p>
          </div>

          <div className="flex gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                className={filledDemo?.email === account.email ? chipActive : chipIdle}
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                  setError(null);
                }}
              >
                {account.label}
              </button>
            ))}
          </div>

          <form className="grid gap-4" onSubmit={onSubmit}>
            <label className="grid gap-1.5 text-xs font-semibold text-muted" htmlFor="email">
              E-mail
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                className={`${fieldInput} font-normal text-ink`}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-muted" htmlFor="password">
              Senha
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                className={`${fieldInput} font-normal text-ink`}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {error ? (
              <p className="m-0 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <button className={`${btn} mt-1 w-full`} type="submit" disabled={pending}>
              {pending ? 'Entrando…' : filledDemo ? `Entrar como ${filledDemo.label}` : 'Entrar'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
