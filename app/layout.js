import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/components/Toast';
import SessionWarning from '@/components/SessionWarning';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const metadata = {
  title: 'Lead Manager - Contact Outreach Platform',
  description: 'Manage contacts, assign leads to partners, and track outreach campaigns efficiently.',
  keywords: 'lead management, contacts, CRM, outreach, partner management',
  authors: [{ name: 'Lead Manager Team' }],
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Lead Manager - Contact Outreach Platform',
    description: 'Manage contacts, assign leads to partners, and track outreach campaigns efficiently.',
    type: 'website',
  },
};

// Viewport config (separated for Next.js 14.2+)
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#3B82F6',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>
            <SessionWarning />
            {children}
          </ToastProvider>
        </AuthProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
