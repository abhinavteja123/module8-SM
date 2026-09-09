import { createContext, useContext, useEffect, useState } from 'react';
import { api, setTokens, clearTokens } from '../lib/api.js';
import { cacheMentorAllocations, clearMentorAllocations } from '../lib/mentorAllocationCache.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hasToken = !!localStorage.getItem('accessToken');
    if (!hasToken) {
      setLoading(false);
      return;
    }
    api('/users/me')
      .then(setUser)
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    clearMentorAllocations();
    if (data.user.roles?.some((role) => role.role === 'faculty')) {
      // Prime direct-mentor workspaces before routing. This avoids showing an
      // empty allocation picker for a moment immediately after sign-in.
      try {
        const profile = await api('/research/my-mentor-profile');
        if (profile?.mentorship_scope === 'crcs_self') {
          cacheMentorAllocations(data.user.id, await api('/mentor-allocations'));
        }
      } catch {
        // The normal page query remains the fallback if this optional preload fails.
      }
    }
    setUser(data.user);
    return data.user;
  }

  function logout() {
    clearTokens();
    clearMentorAllocations();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
