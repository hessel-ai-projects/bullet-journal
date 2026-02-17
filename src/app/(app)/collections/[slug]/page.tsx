export default function CollectionPage({ params }: { params: { slug: string } }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight capitalize">{params.slug}</h1>
        <p className="text-muted-foreground text-sm">Collection</p>
      </div>
      <p className="text-muted-foreground text-sm py-8 text-center">
        Collection view coming in Phase 2.
      </p>
    </div>
  );
}
