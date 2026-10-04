import type { Metadata } from 'next';
import './globals.css'
import 'leaflet/dist/leaflet.css';
import 'katex/dist/katex.min.css';
import './workspace.css';

export const metadata: Metadata = {
  title: 'Clarifi — Service Operations',
  description: 'Private estimating, client management, scheduling and job operations for service teams.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
