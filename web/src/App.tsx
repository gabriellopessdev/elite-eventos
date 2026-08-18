import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { useAuth } from './auth/useAuth';
import { homeRouteFor } from './auth/auth';
import { Shell } from './chrome/Shell';
import { LoginPage } from './LoginPage';
import { EventsPage } from './events/EventsPage';
import { EventPage } from './events/EventPage';
import { NewEventPage } from './events/NewEventPage';
import { TicketsPage } from './tickets/TicketsPage';
import { DoorPage } from './door/DoorPage';

function RoleHome() {
  const { session } = useAuth();
  return <Navigate to={homeRouteFor(session?.user.role)} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Shell />}>
        {/* A raiz manda cada papel para a casa dele — cartaz, ou portaria. */}
        <Route path="/" element={<RoleHome />} />
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
