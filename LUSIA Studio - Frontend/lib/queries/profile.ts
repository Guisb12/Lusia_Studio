"use client";

import { fetchMyProfile, type Member } from "@/lib/members";
import { queryClient, useQuery } from "@/lib/query-client";

// Singleton query: no list/detail split, snapshot/restore, or sync helpers needed.
// Profile is a single entity patched in place after inline saves.
export const MY_PROFILE_QUERY_KEY = "members:me";
const MY_PROFILE_STALE_TIME = 5 * 60_000;

export function useMyProfileQuery(initialData?: Member, enabled = true) {
  return useQuery<Member>({
    key: MY_PROFILE_QUERY_KEY,
    enabled,
    staleTime: MY_PROFILE_STALE_TIME,
    initialData,
    fetcher: fetchMyProfile,
  });
}

export function prefetchMyProfileQuery() {
  return queryClient.fetchQuery<Member>({
    key: MY_PROFILE_QUERY_KEY,
    staleTime: MY_PROFILE_STALE_TIME,
    fetcher: fetchMyProfile,
  });
}

export function patchMyProfileQuery(
  updater: Member | ((current: Member | undefined) => Member | undefined),
) {
  queryClient.setQueryData<Member>(MY_PROFILE_QUERY_KEY, updater);
}
