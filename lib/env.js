/**
 * Environment Configuration and Validation
 * 
 * This module validates required environment variables and provides
 * typed access to configuration values throughout the application.
 */

import { z } from 'zod';

// Environment schema definition
const envSchema = z.object({
  // Required
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Server
  PORT: z.string().transform(Number).pipe(z.number().positive()).default('3000'),
  HOST: z.string().default('localhost'),
  
  // JWT - Required for authentication
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters for security'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  // Database
  DATABASE_PATH: z.string().default('./data'),
  
  // Rate Limiting
  RATE_LIMIT_MAX: z.string().transform(Number).pipe(z.number().positive()).default('100'),
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).pipe(z.number().positive()).default('60000'),
  
  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  
  // Optional external services
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).pipe(z.number().positive()).optional(),
  SMTP_USER: z.string().email().optional(),
  SMTP_PASS: z.string().optional(),
});

// Validation function
function validateEnv() {
  // For client-side, only expose public env vars
  if (typeof window !== 'undefined') {
    return {
      isClient: true,
      NODE_ENV: process.env.NODE_ENV || 'development',
    };
  }

  // Check for required variables before validation
  const requiredVars = ['JWT_SECRET'];
  const missingVars = requiredVars.filter(key => !process.env[key]);
  
  if (missingVars.length > 0) {
    console.warn(`
╔════════════════════════════════════════════════════════════════════╗
║                    ⚠️  ENVIRONMENT WARNING                          ║
╠════════════════════════════════════════════════════════════════════╣
║  Missing required environment variables:                           ║
║  ${missingVars.join(', ').padEnd(60)}║
║                                                                    ║
║  Please copy .env.example to .env and configure the values.       ║
║  For development, default values will be used.                     ║
╚════════════════════════════════════════════════════════════════════╝
    `);
    
    // Use defaults for development
    if (process.env.NODE_ENV !== 'production') {
      process.env.JWT_SECRET = process.env.JWT_SECRET || 'development-jwt-secret-not-for-production-use-only';
    }
  }
  
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    const errors = result.error.errors.map(err => `  - ${err.path.join('.')}: ${err.message}`);
    
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`
╔════════════════════════════════════════════════════════════════════╗
║                    ❌ CONFIGURATION ERROR                          ║
╠════════════════════════════════════════════════════════════════════╣
║  Invalid environment configuration:                                ║
${errors.map(e => `║  ${e.padEnd(62)}║`).join('\n')}
║                                                                    ║
║  Please check your environment variables and try again.           ║
╚════════════════════════════════════════════════════════════════════╝
      `.trim());
    }
    
    console.warn('Environment validation warnings:', errors.join('\n'));
    
    // Return partial config with defaults for development
    return {
      NODE_ENV: process.env.NODE_ENV || 'development',
      PORT: parseInt(process.env.PORT || '3000', 10),
      HOST: process.env.HOST || 'localhost',
      JWT_SECRET: process.env.JWT_SECRET || 'development-jwt-secret-not-for-production-use-only',
      JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
      DATABASE_PATH: process.env.DATABASE_PATH || './data',
      RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
      LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    };
  }
  
  return result.data;
}

// Validated environment configuration
export const env = validateEnv();

// Type exports for TypeScript consumers
export const config = {
  // Server
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT || 3000,
  host: env.HOST || 'localhost',
  
  // Auth
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN || '7d',
  },
  
  // Database
  database: {
    path: env.DATABASE_PATH || './data',
  },
  
  // Rate limiting
  rateLimit: {
    max: env.RATE_LIMIT_MAX || 100,
    windowMs: env.RATE_LIMIT_WINDOW_MS || 60000,
  },
  
  // Logging
  logLevel: env.LOG_LEVEL || 'info',
  
  // Feature flags (can be expanded based on needs)
  features: {
    enableAnalytics: !!process.env.ANALYTICS_ID,
    enableEmail: !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS),
  },
};

// Helper function to check if all required config is present
export function validateConfig() {
  const issues = [];
  
  if (!config.jwt.secret || config.jwt.secret.includes('development')) {
    issues.push('JWT_SECRET is not configured or using development default');
  }
  
  if (config.isProduction) {
    if (config.jwt.secret.length < 64) {
      issues.push('JWT_SECRET should be at least 64 characters in production');
    }
    
    if (config.rateLimit.max > 1000) {
      issues.push('Rate limit seems too high for production');
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
    config,
  };
}

// Log config status on import (server-side only)
if (typeof window === 'undefined') {
  const validation = validateConfig();
  
  if (!validation.valid && !config.isDevelopment) {
    console.warn('Configuration issues detected:', validation.issues);
  } else if (config.isDevelopment) {
    console.log(`
┌─────────────────────────────────────────┐
│  🚀 Contact App - Development Mode      │
├─────────────────────────────────────────┤
│  Port: ${String(config.port).padEnd(32)}│
│  Database: ${config.database.path.padEnd(28)}│
│  Log Level: ${config.logLevel.padEnd(27)}│
└─────────────────────────────────────────┘
    `.trim());
  }
}

export default config;
