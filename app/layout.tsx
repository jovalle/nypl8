import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:5360'),
  title: 'nypl8 — NY personalized plate availability',
  description:
    'Check multiple New York passenger personalized plate ideas against the official NY DMV service.',
  applicationName: 'nypl8',
  alternates: { canonical: '/' },
  icons: {
    icon: [{ url: '/ny-state-symbol.png', type: 'image/png', sizes: '78x68' }],
  },
  openGraph: {
    type: 'website',
    url: '/',
    title: 'nypl8 — NY personalized plate availability',
    description: 'Check personalized New York passenger plate ideas against the NY DMV.',
    siteName: 'nypl8',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
