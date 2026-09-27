'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/upload', label: 'Upload' },
  { href: '/documents', label: 'Documents' },
  { href: '/review', label: 'Review queue' },
];

export function Nav({ reviewCount }: { reviewCount: number }) {
  const pathname = usePathname();

  return (
    <nav className="sidebar-nav">
      {LINKS.map((link) => {
        const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} className={`sidebar-link${active ? ' active' : ''}`}>
            <span>{link.label}</span>
            {link.href === '/review' && reviewCount > 0 && (
              <span className="sidebar-badge">{reviewCount}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
