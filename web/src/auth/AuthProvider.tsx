import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  commitSession,
  hydrateSession,
  isAccessExpired,
  loadSession,
  loginRequest,
  logoutRequest,
  subscribeSession,
} from './auth';
import { AuthContext } from './context';

function sessionIfAccessLive() {
  const session = loadSession();
  if (!session || isAccessExpired(session.accessToken)) {
    return null;
  }
  return session;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(sessionIfAccessLive);

  useEffect(() => {
    const unsub = subscribeSession(setSession);
    void hydrateSession();
    return unsub;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const next = await loginRequest(email, password);
    commitSession(next);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = session?.refreshToken;
    if (refreshToken) {
      await logoutRequest(refreshToken);
    }
    commitSession(null);
  }, [session]);

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
