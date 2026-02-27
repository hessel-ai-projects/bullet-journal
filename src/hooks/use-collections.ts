'use client';

import useSWR from 'swr';
import {
  fetchCollections,
  fetchCollection,
  fetchCollectionByType,
  fetchCollectionEntries,
} from '@/lib/collections';
import type { CollectionType } from '@/lib/types';

/**
 * Hook for all collections
 * Refreshes every 10 seconds
 */
export function useCollections() {
  const { data, error, isLoading, mutate } = useSWR(
    'collections',
    fetchCollections,
    {
      refreshInterval: 10000, // 10 seconds
      revalidateOnFocus: true,
    }
  );

  return {
    collections: data ?? [],
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook for single collection
 * Refreshes every 10 seconds
 */
export function useCollection(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? ['collection', id] : null,
    () => fetchCollection(id),
    {
      refreshInterval: 10000,
      revalidateOnFocus: true,
    }
  );

  return {
    collection: data,
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook for collection by type (meetings, ideas)
 * Refreshes every 10 seconds
 */
export function useCollectionByType(type: CollectionType) {
  const { data, error, isLoading, mutate } = useSWR(
    type ? ['collection-type', type] : null,
    () => fetchCollectionByType(type),
    {
      refreshInterval: 10000,
      revalidateOnFocus: true,
    }
  );

  return {
    collection: data,
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook for entries in a collection
 * Refreshes every 5 seconds
 */
export function useCollectionEntries(collectionId: string) {
  const { data, error, isLoading, mutate } = useSWR(
    collectionId ? ['collection-entries', collectionId] : null,
    () => fetchCollectionEntries(collectionId),
    {
      refreshInterval: 5000, // 5 seconds
      revalidateOnFocus: true,
    }
  );

  return {
    entries: data ?? [],
    isLoading,
    error,
    mutate,
  };
}
