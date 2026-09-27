import type { Metadata } from 'next';
import { eq, count } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { Nav } from './components/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ledger — AI Document Intelligence',
  description:
    'AI-powered document intelligence and workflow automation: unstructured business documents to validated structured data, with confidence scoring and human-in-the-loop review.',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let reviewCount = 0;
  try {
    const [row] = await db.select({ value: count() }).from(documents).where(eq(documents.status, 'NEEDS_REVIEW'));
    reviewCount = row?.value ?? 0;
  } catch {
    // Database not yet migrated (e.g. first boot) -- fail quietly, badge just won't show.
  }

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="app-shell">
          <aside className="sidebar">
            <div className="sidebar-brand">
              Ledger
              <span>Document Intelligence Agent</span>
            </div>
            <Nav reviewCount={reviewCount} />
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
