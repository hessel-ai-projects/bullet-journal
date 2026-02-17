'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { createCollection } from '@/lib/collections';

export default function NewCollectionPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📁');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const col = await createCollection({
      name: name.trim(),
      type: 'custom',
      icon: icon || '📁',
    });
    if (col) {
      toast('Collection created');
      router.push(`/collections/${col.id}`);
    } else {
      toast.error('Failed to create collection');
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Collection</h1>
        <p className="text-muted-foreground text-sm">Create a custom collection</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Collection name"
            className="text-foreground"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </div>
        <div>
          <Label htmlFor="icon">Icon (emoji)</Label>
          <Input
            id="icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className="text-foreground w-20"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCreate} disabled={!name.trim() || creating}>
            {creating ? 'Creating...' : 'Create Collection'}
          </Button>
          <Button variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
