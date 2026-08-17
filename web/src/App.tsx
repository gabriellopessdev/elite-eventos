import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { Shell } from './chrome/Shell';
import { LoginPage } from './LoginPage';
import { Home } from './Home';
import { EventsPage } from './events/EventsPage';
import { EventPage } from './events/EventPage';
import { NewEventPage } from './events/NewEventPage';
import { island } from './ui';

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
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/new" element={<NewEventPage />} />
        <Route path="/events/:id" element={<EventPage />} />
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
