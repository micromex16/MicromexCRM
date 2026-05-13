import type { Metadata } from 'next';
import { Inter, Inter_Tight } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Micromex Lead Engine',
  description: 'USMCA contract manufacturing — outbound lead engine. Est. 1988.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable}`}>
      <body className="font-sans">
        {children}
        <Toaster richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
