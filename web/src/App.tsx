import type { ReactNode } from 'react';
import { Link, Route, Routes } from 'react-router-dom';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          Elite Eventos
        </Link>
        <nav className="nav">
          <Link to="/events">Eventos</Link>
          <Link to="/tickets">Ingressos</Link>
          <Link to="/door">Portaria</Link>
        </nav>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}

function Home() {
  return (
    <Shell>
      <section className="hero">
        <h1>Ingressos com lugar marcado</h1>
        <p>
          Hold de 10 minutos, pagamento simulado e QR na portaria — mobile e desktop desde o dia 1.
        </p>
        <Link className="btn" to="/events">
          Ver eventos
        </Link>
      </section>
    </Shell>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <Shell>
      <h1>{title}</h1>
      <p className="muted">Próximas fatias do roadmap.</p>
    </Shell>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/events" element={<Placeholder title="Eventos" />} />
      <Route path="/tickets" element={<Placeholder title="Meus ingressos" />} />
      <Route path="/door" element={<Placeholder title="Portaria" />} />
    </Routes>
  );
}
