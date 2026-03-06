/**
 * Email Utility Module
 * Handles sending emails with support for magic links and notifications
 */

import nodemailer from 'nodemailer';
import { env } from './env';

// Create transporter (lazy initialized)
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  
  const smtpConfig = env.getSmtp?.() || {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  };
  
  if (!smtpConfig.host || !smtpConfig.user) {
    return null; // Email not configured
  }
  
  transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.port === 465,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass,
    },
  });
  
  return transporter;
}

/**
 * Check if email service is configured
 */
export function isEmailConfigured() {
  const smtp = {
    host: process.env.SMTP_HOST,
    user: process.env.SMTP_USER,
  };
  return !!(smtp.host && smtp.user);
}

/**
 * Send magic link email for passwordless login
 */
export async function sendMagicLinkEmail(to, magicLink, expiresInMinutes = 15) {
  const transport = getTransporter();
  
  if (!transport) {
    throw new Error('Email service not configured');
  }
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background-color: #f5f5f5;">
      <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h1 style="color: #1f2937; margin-bottom: 16px; font-size: 24px;">Admin Login Request</h1>
        <p style="color: #4b5563; line-height: 1.6;">
          You requested to login to the Admin Dashboard. Click the button below to securely sign in.
        </p>
        <div style="margin: 32px 0; text-align: center;">
          <a href="${magicLink}" 
             style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Sign In to Dashboard
          </a>
        </div>
        <p style="color: #9ca3af; font-size: 14px;">
          This link expires in ${expiresInMinutes} minutes. If you didn't request this, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #9ca3af; font-size: 12px;">
          For security, this link can only be used once.
        </p>
      </div>
    </body>
    </html>
  `;
  
  await transport.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject: 'Admin Login - Magic Link',
    html,
  });
}

/**
 * Send generic notification email
 */
export async function sendNotificationEmail(to, subject, message) {
  const transport = getTransporter();
  
  if (!transport) {
    throw new Error('Email service not configured');
  }
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px;">
      <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px;">
        <h1 style="color: #1f2937; margin-bottom: 16px;">${subject}</h1>
        <p style="color: #4b5563; line-height: 1.6;">${message}</p>
      </div>
    </body>
    </html>
  `;
  
  await transport.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject,
    html,
  });
}
