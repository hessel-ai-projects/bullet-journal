'use client';

import { MeetingNotes } from '@/components/meeting-notes';
import { IdeasCollection } from '@/components/ideas-collection';
import { CustomCollection } from '@/components/custom-collection';

export default function CollectionPage({ params }: { params: { slug: string } }) {
  if (params.slug === 'meetings') {
    return <MeetingNotes />;
  }

  if (params.slug === 'ideas') {
    return <IdeasCollection />;
  }

  // Custom collection by ID
  return <CustomCollection collectionId={params.slug} />;
}
