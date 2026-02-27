import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotAuthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8 px-4 text-center">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">•</h1>
          <h2 className="text-2xl font-semibold tracking-tight">Not Authorized</h2>
          <p className="text-muted-foreground text-sm">
            Your email is not on the allowlist for this application.
          </p>
        </div>

        <div className="rounded-md bg-muted p-4 text-sm">
          <p className="mb-2">
            This is an invite-only application. If you believe you should have access,
            please contact the administrator.
          </p>
        </div>

        <Button asChild variant="outline" className="w-full">
          <Link href="/login">
            Back to Login
          </Link>
        </Button>
      </div>
    </div>
  );
}
