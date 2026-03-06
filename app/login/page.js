'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [magicLinkAvailable, setMagicLinkAvailable] = useState(false);
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check for URL parameters
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'invalid_token') {
      setError('Invalid or expired magic link');
    } else if (errorParam === 'verification_failed') {
      setError('Magic link verification failed');
    }
  }, [searchParams]);

  // Check if magic link is available
  useEffect(() => {
    fetch('/api/auth/magic-link')
      .then(res => res.json())
      .then(data => setMagicLinkAvailable(data.available))
      .catch(() => setMagicLinkAvailable(false));
  }, []);

  useEffect(() => {
    if (!loading && user) {
      router.push(user.role === 'admin' ? '/neo01x' : '/partner');
    }
  }, [user, loading, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const loggedInUser = await login(username, password);
      router.push(loggedInUser.role === 'admin' ? '/neo01x' : '/partner');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLink = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setSuccess('If an admin account exists with this email, a login link has been sent. Check your inbox.');
        setEmail('');
      } else {
        setError(data.error || 'Failed to send magic link');
      }
    } catch (err) {
      setError('Failed to send magic link');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Contact Outreach</h1>
            <p className="text-gray-500 mt-2">Sign in to your account</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}
          
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-4">
              {success}
            </div>
          )}

          {!showMagicLink ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input"
                  placeholder="Enter username"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="Enter password"
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full py-3"
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </button>
              
              {magicLinkAvailable && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowMagicLink(true)}
                    className="text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    Admin? Sign in with email link
                  </button>
                </div>
              )}
            </form>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-6">
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-sm text-indigo-700">
                <strong>Admin Email Login</strong>
                <p className="mt-1">Enter your admin email to receive a secure login link.</p>
              </div>
              
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Admin Email
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="admin@example.com"
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full py-3"
                disabled={isLoading}
              >
                {isLoading ? 'Sending...' : 'Send Magic Link'}
              </button>
              
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setShowMagicLink(false)}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  Back to password login
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
