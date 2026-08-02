import type { Metadata, Viewport } from 'next';
import './globals.css';

const basePath =
  process.env.NEXT_PUBLIC_PLATE_PANTRY_BASE_PATH ?? process.env.NEXT_PUBLIC_NYPL8_BASE_PATH ?? '';
const publicOrigin =
  process.env.PLATE_PANTRY_PUBLIC_ORIGIN ??
  process.env.NYPL8_PUBLIC_ORIGIN ??
  'http://localhost:5360';
const canonicalPath = basePath || '/';

export const metadata: Metadata = {
  metadataBase: new URL(publicOrigin),
  title: 'Plate Pantry — NY personalized plate availability',
  description:
    'Check multiple New York passenger personalized plate ideas against the official NY DMV service.',
  applicationName: 'Plate Pantry',
  alternates: { canonical: canonicalPath },
  icons: {
    icon: [{ url: `${basePath}/ny-state-symbol.png`, type: 'image/png', sizes: '78x68' }],
  },
  openGraph: {
    type: 'website',
    url: canonicalPath,
    title: 'Plate Pantry — NY personalized plate availability',
    description: 'Check personalized New York passenger plate ideas against the NY DMV.',
    siteName: 'Plate Pantry',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style>{`
          @font-face {
            font-family: 'License Plate USA';
            font-style: normal;
            font-weight: 400;
            font-display: block;
            src: url('${basePath}/fonts/license-plate-usa.ttf') format('truetype');
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
