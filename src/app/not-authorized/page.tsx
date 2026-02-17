import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function NotAuthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 px-4">
        <h1 className="text-4xl font-bold">🚫</h1>
        <h2 className="text-2xl font-semibold">Not Authorized</h2>
        <p className="text-muted-foreground max-w-md">
          Your account is not on the whitelist. Contact the admin to request access.
        </p>
        <Button asChild variant="outline">
          <Link href="/login">Back to Login</Link>
        </Button>
      </div>
    </div>
  );
}
