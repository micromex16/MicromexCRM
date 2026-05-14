import { Bell, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileSidebar } from '@/components/layout/Sidebar';
import { initials } from '@/lib/utils';

export function Topbar({ email }: { email: string | null }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background px-3 sm:px-6">
      <div className="flex flex-1 items-center gap-1">
        <MobileSidebar />
        <form action="/leads" method="get" className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            placeholder="Search companies…"
            className="h-9 pl-9"
          />
        </form>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <Button variant="ghost" size="icon" aria-label="Notifications" className="hidden sm:flex">
          <Bell className="h-4 w-4" />
        </Button>
        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm transition-colors hover:bg-muted"
            title="Sign out"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-mx-500 text-xs font-semibold text-white">
              {initials(email)}
            </div>
            <span className="hidden text-muted-foreground sm:inline">
              {email ?? 'signed out'}
            </span>
          </button>
        </form>
      </div>
    </header>
  );
}
