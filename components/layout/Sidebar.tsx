'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Send,
  FileText,
  PenLine,
  Database,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/campaigns', label: 'Campaigns', icon: Send },
  { href: '/templates', label: 'Templates', icon: FileText },
  { href: '/composer', label: 'Composer', icon: PenLine },
  { href: '/sources', label: 'Sources', icon: Database },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function Sidebar() {
  const path = usePathname();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col bg-mx-900 text-mx-100">
      <div className="flex h-16 items-center gap-2 px-5">
        <div className="rounded-md bg-white/10 p-1.5">
          <Image src="/favicon.svg" alt="" width={20} height={20} />
        </div>
        <div className="leading-tight">
          <div className="font-display text-sm font-semibold tracking-tight text-white">
            Micromex
          </div>
          <div className="text-[10px] uppercase tracking-wider text-mx-300">Lead Engine</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-mx-700 text-white'
                  : 'text-mx-200 hover:bg-mx-800 hover:text-white',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-mx-800 p-4 text-[10px] uppercase tracking-wider text-mx-400">
        Est. 1988 · USMCA
      </div>
    </aside>
  );
}
