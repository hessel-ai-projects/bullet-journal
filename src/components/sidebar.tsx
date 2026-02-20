'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import type { Collection } from '@/lib/types';

const navItems = [
  { href: '/', label: 'Daily Log', icon: '📅' },
  { href: '/monthly', label: 'Monthly Log', icon: '📆' },
  { href: '/future', label: 'Future Log', icon: '🔮' },
];

function SidebarContent({ collections, onNavigate }: { collections: Collection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [expandCollections, setExpandCollections] = useState(true);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-2">
        <Link href="/" className="flex items-center gap-2" onClick={onNavigate}>
          <span className="text-2xl font-bold">●</span>
          <span className="text-lg font-semibold tracking-tight">Bullet Journal</span>
        </Link>
      </div>

      <ScrollArea className="flex-1 px-2">
        <nav className="space-y-1 py-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                pathname === item.href
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <Separator className="my-2" />

        <div className="py-2">
          <div className="flex items-center justify-between px-3 py-2">
            <button
              onClick={() => setExpandCollections(!expandCollections)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="font-medium">Collections</span>
              <span className="text-xs">{expandCollections ? '▼' : '▶'}</span>
            </button>
            <Link
              href="/collections/new"
              onClick={onNavigate}
              className="text-muted-foreground hover:text-foreground text-sm px-1 transition-colors"
              title="New collection"
            >
              +
            </Link>
          </div>

          {expandCollections && (
            <div className="space-y-1 ml-2">
              <Link
                href="/collections/meetings"
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  pathname === '/collections/meetings'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <span>📋</span>
                <span>Meeting Notes</span>
              </Link>
              <Link
                href="/collections/ideas"
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  pathname === '/collections/ideas'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <span>💡</span>
                <span>Ideas</span>
              </Link>
              {collections
                .filter((c) => c.type === 'custom')
                .map((c) => (
                  <Link
                    key={c.id}
                    href={`/collections/${c.id}`}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      pathname === `/collections/${c.id}`
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <span>{c.icon}</span>
                    <span>{c.name}</span>
                  </Link>
                ))}
            </div>
          )}
        </div>

        <Separator className="my-2" />

        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
            pathname === '/settings'
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <span>⚙️</span>
          <span>Settings</span>
        </Link>
      </ScrollArea>

      <div className="p-4 space-y-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className="w-full justify-start text-muted-foreground"
        >
          {theme === 'dark' ? '☀️' : '🌙'} {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="w-full justify-start text-muted-foreground"
        >
          🚪 Sign out
        </Button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('collections')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setCollections(data as Collection[]);
      });
  }, [pathname]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:border-r bg-background h-screen sticky top-0">
        <SidebarContent collections={collections} />
      </aside>

      {/* Mobile hamburger */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-background border-b px-4 py-3 flex items-center">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm">
              ☰
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SidebarContent collections={collections} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <span className="ml-2 font-semibold">Bullet Journal</span>
      </div>
    </>
  );
}
