import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import config from './env';

export const JWT_SECRET = config.jwt.secret;

// Verify JWT token from request
export function verifyToken(request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return { error: 'Access token required', status: 401 };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { user: decoded };
  } catch (err) {
    return { error: 'Invalid or expired token', status: 403 };
  }
}

// Create JWT token
export function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: config.jwt.expiresIn });
}

// Auth error response helper
export function authError(message, status = 401) {
  return NextResponse.json({ error: message }, { status });
}

// Require authentication middleware
export function requireAuth(request) {
  const result = verifyToken(request);
  if (result.error) {
    return { error: NextResponse.json({ error: result.error }, { status: result.status }) };
  }
  return { user: result.user };
}

// Require admin role
export function requireAdmin(request) {
  const result = requireAuth(request);
  if (result.error) return result;
  
  if (result.user.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return result;
}

// Require partner role (or admin) - supports both 'partner' and legacy 'worker' roles
export function requirePartner(request) {
  const result = requireAuth(request);
  if (result.error) return result;
  
  if (result.user.role !== 'partner' && result.user.role !== 'worker' && result.user.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Partner access required' }, { status: 403 }) };
  }
  return result;
}

// Alias for backward compatibility
export const requireWorker = requirePartner;
