import { requireUser } from '@/lib/auth/require';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar email={user.email ?? null} />
        <main className="flex-1 overflow-y-auto bg-mx-50/30">
          {children}
        </main>
      </div>
    </div>
  );
}
