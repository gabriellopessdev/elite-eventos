import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthError, DEMO_ACCOUNTS, ROLE_LABEL } from './auth/auth';
import { useAuth } from './auth/useAuth';
import { btn, btnGhost, chipActive, chipIdle, fieldInput, fieldLabel, hintError, pill } from './ui';
import { CheckIcon, FilmIcon, ScanIcon } from './icons';

/** Only same-origin relative paths; reject protocol-relative `//evil`. */
export function safeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

export function LoginPage() {
  const { login, session } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = safeNextPath(searchParams.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const filledDemo = DEMO_ACCOUNTS.find((account) => account.email === email);
  const continueTo = next ?? '/';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(email, password);
      navigate(continueTo);
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
        <section className="grid w-full max-w-md gap-4 rounded-2xl border border-line bg-surface p-8">
          <h1 className="m-0 text-2xl font-extrabold">Você já entrou</h1>
          <p className="m-0 text-muted">
            {session.user.name} · {ROLE_LABEL[session.user.role]}
          </p>
          <Link className={btn} to={continueTo}>
            Continuar
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas md:flex-row">
      <aside className="relative flex min-h-52 flex-col justify-between overflow-hidden px-6 py-8 md:min-h-dvh md:flex-1 md:px-14 md:py-14">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 90% 70% at 12% 100%, rgb(105 101 219 / 0.55), transparent 55%), radial-gradient(ellipse 60% 50% at 100% 0%, rgb(196 181 255 / 0.18), transparent 50%), linear-gradient(160deg, #190064 0%, #33249c 52%, #6965db 100%)',
          }}
        />

        <div className="relative flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg border border-white/40 text-white">
            <FilmIcon size={20} />
          </span>
          <span className="font-extrabold tracking-tight text-white">Elite Eventos</span>
        </div>

        <div className="relative flex max-w-120 flex-col gap-5">
          <span className={`${pill} self-start border-white/50 text-white`}>Lugar marcado</span>
          <h1 className="m-0 text-4xl font-extrabold tracking-tight text-balance text-white md:text-[3.4rem] md:leading-[1.05]">
            Escolha o assento. Pague. Entre.
          </h1>
          <p className="m-0 text-[17px] leading-relaxed text-white/75">
            Sem fila e sem letra miúda. Seus lugares ficam guardados por 10 minutos enquanto você
            paga.
          </p>
        </div>

        <div className="relative hidden items-center gap-6 text-[13px] font-semibold text-white/65 md:flex">
          <span className="flex items-center gap-2">
            <CheckIcon size={17} />
            Assento garantido no ato
          </span>
          <span className="flex items-center gap-2">
            <ScanIcon size={17} />
            QR na portaria
          </span>
        </div>
      </aside>

      <section className="flex flex-1 flex-col justify-center gap-6 px-6 py-10 md:px-16 md:py-14">
        <div className="mx-auto grid w-full max-w-md gap-6">
          <div className="grid gap-1.5">
            <h2 className="m-0 text-3xl font-extrabold tracking-tight">Entrar</h2>
            <p className="m-0 text-[13px] text-muted">
              Os atalhos preenchem uma conta do seed. O papel vem da conta, não do botão.
            </p>
          </div>

          <div className="flex gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                className={`${filledDemo?.email === account.email ? chipActive : chipIdle} flex-1`}
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
            <label className={`grid gap-1.5 ${fieldLabel}`} htmlFor="email">
              E-mail
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                className={`${fieldInput} font-normal`}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className={`grid gap-1.5 ${fieldLabel}`} htmlFor="password">
              Senha
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                className={`${fieldInput} font-normal`}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {error ? (
              <p className={`m-0 ${hintError}`} role="alert">
                {error}
              </p>
            ) : null}
            <button
              className={`${btn} mt-1 min-h-13 w-full text-base`}
              type="submit"
              disabled={pending}
            >
              {pending ? 'Entrando…' : filledDemo ? `Entrar como ${filledDemo.label}` : 'Entrar'}
            </button>
          </form>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[13px] text-faint">ou</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <Link className={`${btnGhost} w-full`} to="/events">
            Ver o cartaz sem entrar
          </Link>
        </div>
      </section>
    </div>
  );
}
