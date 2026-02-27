'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import type { Collection } from '@/lib/types';
import { fetchCollections } from '@/lib/collections';

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
    await signOut({ callbackUrl: '/login' });
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
                  : 'hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <Separator className="my-2" />

        <div className="px-2 py-1">
          <button
            onClick={() => setExpandCollections(!expandCollections)}
            className="flex items-center justify-between w-full px-2 py-1.5 text-sm font-medium"
          >
            <span>Collections</span>
            <span className="text-muted-foreground">{expandCollections ? '▼' : '▶'}</span>
          </button>

          {expandCollections && (
            <div className="mt-1 space-y-0.5">
              <Link
                href="/collections/meetings"
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  pathname === '/collections/meetings'
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground'
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
                    : 'hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <span>💡</span>
                <span>Ideas</span>
              </Link>
              {collections.map((collection) => (
                <Link
                  key={collection.id}
                  href={`/collections/${collection.id}`}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    pathname === `/collections/${collection.id}`
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <span>{collection.icon}</span>
                  <span>{collection.name}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={toggleTheme} className="flex-1">
            {theme === 'dark' ? '🌙' : '☀️'}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="flex-1">
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchCollections().then(setCollections);
  }, []);

  return (
    <>
      {/* Mobile */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild className="lg:hidden">
          <Button variant="outline" size="icon" className="fixed top-4 left-4 z-40">
            <span className="sr-only">Open sidebar</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SidebarContent collections={collections} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Desktop */}
      <aside className="hidden lg:block w-64 border-r bg-background h-screen sticky top-0">
        <SidebarContent collections={collections} />
      </aside>
    </>
  );
}
