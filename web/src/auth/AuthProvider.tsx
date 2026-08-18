import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadSession, loginRequest, logoutRequest, subscribeSession, writeSession } from './auth';
import { AuthContext } from './context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(() => loadSession());
  const navigate = useNavigate();

  useEffect(() => {
    return subscribeSession((next, meta) => {
      setSession(next);
      if (meta?.kick) navigate('/login', { replace: true });
    });
  }, [navigate]);

  const login = useCallback(async (email: string, password: string) => {
    const next = await loginRequest(email, password);
    writeSession(next);
    setSession(next);
  }, []);

  const logout = useCallback(async () => {
    const current = loadSession();
    if (current?.refreshToken) {
      await logoutRequest(current.refreshToken);
    }
    writeSession(null);
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
