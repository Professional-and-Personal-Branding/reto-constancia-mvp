import type { Metadata } from 'next';
import { Anton, Manrope } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { THEME_INIT_SCRIPT } from '@/lib/theme';

const display = Anton({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
});

const sans = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Reto de Constancia',
  description: 'Disciplina activada, excusas desinstaladas',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // El tema se fija en <head> antes de pintar (data-theme), fuera de React
    <html lang="es" className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans bg-bg text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
