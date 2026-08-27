import type { Metadata, Viewport } from 'next';
import '@fontsource/montserrat/latin-400.css';
import '@fontsource/montserrat/latin-600.css';
import '@fontsource/montserrat/latin-700.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '../styles/tokens.css';
import '../styles/global.css';

export const metadata: Metadata = {
  title: 'Votacións | GB Lorchos',
  description: 'Aplicación de votacións de GB Lorchos.',
  applicationName: 'Votacións GB Lorchos',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#152536',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang='gl'>
      <body>{children}</body>
    </html>
  );
}
