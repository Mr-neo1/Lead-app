'use client';

import { useAuth } from '@/context/AuthContext';

export default function SessionWarning() {
  const { sessionWarning, extendSession, logout } = useAuth();

  if (!sessionWarning) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Session Expiring</h3>
            <p className="text-sm text-gray-500">Your session will expire in 5 minutes</p>
          </div>
        </div>
        
        <p className="text-gray-600 text-sm mb-4">
          You&apos;ve been inactive for a while. Would you like to stay logged in?
        </p>
        
        <div className="flex gap-3">
          <button
            onClick={logout}
            className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Logout
          </button>
          <button
            onClick={extendSession}
            className="flex-1 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
}
