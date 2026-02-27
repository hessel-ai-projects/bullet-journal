'use client';

import useSWR from 'swr';
import {
  fetchMeetingNotes,
  fetchMeetingNote,
} from '@/lib/meeting-notes';

/**
 * Hook for meeting notes in a collection
 * Refreshes every 10 seconds
 */
export function useMeetingNotes(collectionId: string) {
  const { data, error, isLoading, mutate } = useSWR(
    collectionId ? ['meeting-notes', collectionId] : null,
    () => fetchMeetingNotes(collectionId),
    {
      refreshInterval: 10000, // 10 seconds
      revalidateOnFocus: true,
    }
  );

  return {
    meetingNotes: data ?? [],
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook for single meeting note
 * Refreshes every 10 seconds
 */
export function useMeetingNote(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? ['meeting-note', id] : null,
    () => fetchMeetingNote(id),
    {
      refreshInterval: 10000,
      revalidateOnFocus: true,
    }
  );

  return {
    meetingNote: data,
    isLoading,
    error,
    mutate,
  };
}
