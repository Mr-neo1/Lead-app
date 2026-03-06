/**
 * Magic Link Authentication API
 * Handles passwordless login for admin users
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, initializeDatabase, schema, eq, generateId, now } from '@/lib/turso';
import { sendMagicLinkEmail, isEmailConfigured } from '@/lib/email';
import { createToken } from '@/lib/auth';

// In-memory store for magic link tokens (in production, use Redis or database)
// Tokens are short-lived so in-memory is acceptable for single-instance deployments
const magicLinkTokens = new Map();

// Clean up expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of magicLinkTokens.entries()) {
    if (data.expiresAt < now) {
      magicLinkTokens.delete(token);
    }
  }
}, 60000); // Every minute

/**
 * POST /api/auth/magic-link
 * Request a magic link for admin login
 */
export async function POST(request) {
  try {
    // Check if email is configured
    if (!isEmailConfigured()) {
      return NextResponse.json(
        { error: 'Email service not configured. Please use password login.' },
        { status: 503 }
      );
    }
    
    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }
    
    await initializeDatabase();
    const database = db();
    
    // Find admin user by email
    const [user] = await database.select().from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1);
    
    if (!user || user.role !== 'admin') {
      // Don't reveal if user exists - always return success
      return NextResponse.json({
        success: true,
        message: 'If an admin account exists with this email, a magic link has been sent.'
      });
    }
    
    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
    
    // Store token
    magicLinkTokens.set(token, {
      userId: user.id,
      email: user.email,
      expiresAt,
      used: false,
    });
    
    // Build magic link URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                   (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const magicLink = `${baseUrl}/api/auth/magic-link/verify?token=${token}`;
    
    // Send email
    await sendMagicLinkEmail(user.email, magicLink, 15);
    
    return NextResponse.json({
      success: true,
      message: 'If an admin account exists with this email, a magic link has been sent.'
    });
    
  } catch (error) {
    console.error('Magic link request error:', error);
    return NextResponse.json(
      { error: 'Failed to send magic link' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/magic-link
 * Check if magic link is available
 */
export async function GET() {
  return NextResponse.json({
    available: isEmailConfigured(),
    message: isEmailConfigured() 
      ? 'Magic link authentication is available' 
      : 'Email service not configured'
  });
}
