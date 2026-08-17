import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { loadSession, loginRequest, logoutRequest, saveSession } from './auth';
import { AuthContext } from './context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(() => loadSession());

  const login = useCallback(async (email: string, password: string) => {
    const next = await loginRequest(email, password);
    saveSession(next);
    setSession(next);
  }, []);

  const logout = useCallback(async () => {
    if (session?.refreshToken) {
      await logoutRequest(session.refreshToken);
    }
    saveSession(null);
    setSession(null);
  }, [session]);

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
