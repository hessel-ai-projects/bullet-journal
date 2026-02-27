'use client';

import useSWR from 'swr';
import {
  fetchEntriesForDate,
  fetchEntriesForMonth,
  fetchMonthlyEntries,
  fetchFutureEntries,
  fetchUnassignedMonthlyTasks,
  fetchIncompleteFromPast,
} from '@/lib/entries';

// Fetcher wrappers
const dailyFetcher = (date: string) => fetchEntriesForDate(date);
const monthDaysFetcher = ([year, month]: [number, number]) =>
  fetchEntriesForMonth(year, month);
const monthlyFetcher = ([year, month]: [number, number]) =>
  fetchMonthlyEntries(year, month);
const futureFetcher = () => fetchFutureEntries();
const unassignedFetcher = ([year, month]: [number, number]) =>
  fetchUnassignedMonthlyTasks(year, month);
const incompleteFetcher = (beforeDate: string) =>
  fetchIncompleteFromPast(beforeDate);

/**
 * Hook for daily log entries
 * Refreshes every 3 seconds
 */
export function useDailyEntries(date: string) {
  const { data, error, isLoading, mutate } = useSWR(
    date ? ['daily', date] : null,
    () => dailyFetcher(date),
    {
      refreshInterval: 3000, // 3 seconds
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

/**
 * Hook for monthly log panel entries
 * Refreshes every 5 seconds
 */
export function useMonthlyEntries(year: number, month: number) {
  const { data, error, isLoading, mutate } = useSWR(
    year && month ? ['monthly', year, month] : null,
    () => monthlyFetcher([year, month]),
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

/**
 * Hook for future log entries
 * Refreshes every 10 seconds
 */
export function useFutureEntries() {
  const { data, error, isLoading, mutate } = useSWR(
    'future',
    futureFetcher,
    {
      refreshInterval: 10000, // 10 seconds
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

/**
 * Hook for unassigned monthly tasks
 * Refreshes every 5 seconds
 */
export function useUnassignedMonthlyTasks(year: number, month: number) {
  const { data, error, isLoading, mutate } = useSWR(
    year && month ? ['unassigned', year, month] : null,
    () => unassignedFetcher([year, month]),
    {
      refreshInterval: 5000, // 5 seconds
      revalidateOnFocus: true,
    }
  );

  return {
    tasks: data ?? [],
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook for incomplete past tasks
 * Refreshes every 10 seconds
 */
export function useIncompleteFromPast(beforeDate: string) {
  const { data, error, isLoading, mutate } = useSWR(
    beforeDate ? ['incomplete', beforeDate] : null,
    () => incompleteFetcher(beforeDate),
    {
      refreshInterval: 10000, // 10 seconds
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

/**
 * Hook for all entries in a month (daily view)
 */
export function useMonthDays(year: number, month: number) {
  const { data, error, isLoading, mutate } = useSWR(
    year && month ? ['month-days', year, month] : null,
    () => monthDaysFetcher([year, month]),
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
