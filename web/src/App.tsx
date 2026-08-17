import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { Shell } from './chrome/Shell';
import { LoginPage } from './LoginPage';
import { Home } from './Home';
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
        <Route path="/" element={<Home />} />
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
