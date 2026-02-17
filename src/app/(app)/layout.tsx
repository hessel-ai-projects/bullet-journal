import { ThemeProvider } from '@/components/theme-provider';
import { Sidebar } from '@/components/sidebar';
import { Toaster } from '@/components/ui/sonner';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 md:ml-0 mt-14 md:mt-0">
          <div className="container max-w-4xl mx-auto p-6">
            {children}
          </div>
        </main>
      </div>
      <Toaster />
    </ThemeProvider>
  );
}
