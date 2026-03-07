'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

const AuthContext = createContext(null);

// Session timeout in milliseconds (30 minutes)
const SESSION_TIMEOUT = 30 * 60 * 1000;
// Warning before timeout (5 minutes before)
const WARNING_BEFORE = 5 * 60 * 1000;
// User cache validity (5 minutes) - reduces /api/auth/me calls
const USER_CACHE_TTL = 5 * 60 * 1000;

// Storage keys
const STORAGE_KEYS = {
  TOKEN: 'token',
  USER_CACHE: 'user_cache',
  USER_CACHE_TIME: 'user_cache_time',
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionWarning, setSessionWarning] = useState(false);
  const router = useRouter();
  const timeoutRef = useRef(null);
  const warningRef = useRef(null);

  // Reset session timeout on activity
  const resetTimeout = useCallback(() => {
    if (!user) return;
    
    // Clear existing timers
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    
    setSessionWarning(false);
    
    // Set warning timer
    warningRef.current = setTimeout(() => {
      setSessionWarning(true);
    }, SESSION_TIMEOUT - WARNING_BEFORE);
    
    // Set logout timer
    timeoutRef.current = setTimeout(() => {
      logout();
    }, SESSION_TIMEOUT);
  }, [user]);

  // Track user activity
  useEffect(() => {
    if (!user) return;
    
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleActivity = () => {
      resetTimeout();
    };
    
    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });
    
    resetTimeout(); // Start the timer
    
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [user, resetTimeout]);

  useEffect(() => {
    checkAuth();
  }, []);

  // Check if cached user data is still valid
  const getCachedUser = () => {
    try {
      const cachedUser = localStorage.getItem(STORAGE_KEYS.USER_CACHE);
      const cacheTime = localStorage.getItem(STORAGE_KEYS.USER_CACHE_TIME);
      
      if (cachedUser && cacheTime) {
        const age = Date.now() - parseInt(cacheTime, 10);
        if (age < USER_CACHE_TTL) {
          return JSON.parse(cachedUser);
        }
      }
    } catch (e) {
      // Ignore cache errors
    }
    return null;
  };

  // Cache user data
  const setCachedUser = (userData) => {
    try {
      localStorage.setItem(STORAGE_KEYS.USER_CACHE, JSON.stringify(userData));
      localStorage.setItem(STORAGE_KEYS.USER_CACHE_TIME, Date.now().toString());
    } catch (e) {
      // Ignore cache errors
    }
  };

  // Clear user cache
  const clearUserCache = () => {
    localStorage.removeItem(STORAGE_KEYS.USER_CACHE);
    localStorage.removeItem(STORAGE_KEYS.USER_CACHE_TIME);
  };

  const checkAuth = async () => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!token) {
      setLoading(false);
      return;
    }

    // Try to use cached user first for instant UI
    const cachedUser = getCachedUser();
    if (cachedUser) {
      setUser(cachedUser);
      setLoading(false);
      
      // Validate token in background (non-blocking)
      validateTokenInBackground(token);
      return;
    }

    // No cache - fetch from server
    try {
      const response = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data);
        setCachedUser(data);
      } else {
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        clearUserCache();
      }
    } catch (error) {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      clearUserCache();
    }
    setLoading(false);
  };

  // Background validation to keep cache fresh without blocking UI
  const validateTokenInBackground = async (token) => {
    try {
      const response = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data);
        setCachedUser(data);
      } else {
        // Token invalid - clear everything
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        clearUserCache();
        setUser(null);
        router.push('/login');
      }
    } catch (error) {
      // Network error - keep using cached user
      console.warn('Background auth validation failed:', error);
    }
  };

  const login = async (username, password) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }
    
    const { token, user } = await response.json();
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    setCachedUser(user);
    setUser(user);
    return user;
  };

  const logout = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    clearUserCache();
    setUser(null);
    setSessionWarning(false);
    router.push('/login');
  };

  const extendSession = () => {
    resetTimeout();
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, sessionWarning, extendSession }}>
      {children}
    </AuthContext.Provider>
  );
}
