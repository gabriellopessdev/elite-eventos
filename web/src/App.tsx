import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { Shell } from './chrome/Shell';
import { LoginPage } from './LoginPage';
import { EventsPage } from './events/EventsPage';
import { EventPage } from './events/EventPage';
import { NewEventPage } from './events/NewEventPage';
import { TicketsPage } from './tickets/TicketsPage';
import { DoorPage } from './door/DoorPage';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Shell />}>
        {/* A raiz é o cartaz: a antiga Home só repetia o estado vazio dele. */}
        <Route path="/" element={<Navigate to="/events" replace />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/new" element={<NewEventPage />} />
        <Route path="/events/:id" element={<EventPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/door" element={<DoorPage />} />
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
