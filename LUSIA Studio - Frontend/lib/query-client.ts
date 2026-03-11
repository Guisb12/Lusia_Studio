"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useSyncExternalStore,
} from "react";

export type QueryStatus = "idle" | "loading" | "success" | "error";

export interface QuerySnapshot<T> {
    data: T | undefined;
    error: unknown;
    status: QueryStatus;
    updatedAt: number;
}

type QueryUpdater<T> = T | undefined | ((current: T | undefined) => T | undefined);
type QueryMatcher = string | ((key: string) => boolean);

interface QueryRecord<T> {
    snapshot: QuerySnapshot<T>;
    subscribers: Set<() => void>;
    promise: Promise<T> | null;
    gcTimeout: ReturnType<typeof setTimeout> | null;
}

interface FetchQueryOptions<T> {
    key: string;
    fetcher: () => Promise<T>;
    staleTime?: number;
    force?: boolean;
}

export interface UseQueryOptions<T> {
    key: string;
    fetcher: () => Promise<T>;
    enabled?: boolean;
    staleTime?: number;
    initialData?: T;
    initialUpdatedAt?: number;
}

export interface UseQueryResult<T> extends QuerySnapshot<T> {
    isLoading: boolean;
    isFetching: boolean;
    refetch: () => Promise<T | undefined>;
    mutate: (updater: QueryUpdater<T>) => void;
}

export interface QueryEntry<T> {
    key: string;
    snapshot: QuerySnapshot<T>;
}

const DEFAULT_GC_TIME_MS = 5 * 60_000;

function matchesQuery(matcher: QueryMatcher, key: string): boolean {
    if (typeof matcher === "string") {
        return key.startsWith(matcher);
    }
    return matcher(key);
}

class QueryClient {
    private records = new Map<string, QueryRecord<unknown>>();

    private createRecord<T>(): QueryRecord<T> {
        return {
            snapshot: {
                data: undefined,
                error: null,
                status: "idle",
                updatedAt: 0,
            },
            subscribers: new Set(),
            promise: null,
            gcTimeout: null,
        };
    }

    private ensureRecord<T>(key: string): QueryRecord<T> {
        if (!this.records.has(key)) {
            this.records.set(key, this.createRecord<T>());
        }
        return this.records.get(key) as QueryRecord<T>;
    }

    private notify(record: QueryRecord<unknown>) {
        record.subscribers.forEach((listener) => listener());
    }

    private scheduleGc(key: string, record: QueryRecord<unknown>) {
        if (record.gcTimeout || record.subscribers.size > 0 || record.promise) {
            return;
        }

        record.gcTimeout = setTimeout(() => {
            const latest = this.records.get(key);
            if (!latest || latest.subscribers.size > 0 || latest.promise) {
                return;
            }
            this.records.delete(key);
        }, DEFAULT_GC_TIME_MS);
    }

    getSnapshot<T>(key: string): QuerySnapshot<T> {
        return this.ensureRecord<T>(key).snapshot;
    }

    getQueryData<T>(key: string): T | undefined {
        return this.getSnapshot<T>(key).data;
    }

    getMatchingQueries<T>(matcher: QueryMatcher): QueryEntry<T>[] {
        const matches: QueryEntry<T>[] = [];

        for (const [key, record] of this.records) {
            if (!matchesQuery(matcher, key)) {
                continue;
            }

            matches.push({
                key,
                snapshot: record.snapshot as QuerySnapshot<T>,
            });
        }

        return matches;
    }

    subscribe(key: string, listener: () => void): () => void {
        const record = this.ensureRecord(key);
        record.subscribers.add(listener);
        if (record.gcTimeout) {
            clearTimeout(record.gcTimeout);
            record.gcTimeout = null;
        }

        return () => {
            const latest = this.records.get(key);
            if (!latest) {
                return;
            }
            latest.subscribers.delete(listener);
            this.scheduleGc(key, latest);
        };
    }

    primeQueryData<T>(
        key: string,
        data: T,
        updatedAt = Date.now(),
    ): void {
        const record = this.ensureRecord<T>(key);
        if (record.snapshot.data !== undefined) {
            return;
        }

        record.snapshot = {
            data,
            error: null,
            status: "success",
            updatedAt,
        };
    }

    setQueryData<T>(key: string, updater: QueryUpdater<T>): void {
        const record = this.ensureRecord<T>(key);
        const nextData =
            typeof updater === "function"
                ? (updater as (current: T | undefined) => T | undefined)(record.snapshot.data)
                : updater;

        record.snapshot = {
            data: nextData,
            error: null,
            status: nextData === undefined ? "idle" : "success",
            updatedAt: nextData === undefined ? 0 : Date.now(),
        };
        this.notify(record);
    }

    updateQueries<T>(
        matcher: QueryMatcher,
        updater: (current: T | undefined, key: string) => T | undefined,
    ): void {
        for (const [key, record] of this.records) {
            if (!matchesQuery(matcher, key)) {
                continue;
            }

            const nextData = updater(record.snapshot.data as T | undefined, key);
            record.snapshot = {
                data: nextData,
                error: null,
                status: nextData === undefined ? "idle" : "success",
                updatedAt: nextData === undefined ? 0 : Date.now(),
            };
            this.notify(record);
        }
    }

    invalidateQueries(matcher: QueryMatcher): void {
        for (const [key, record] of this.records) {
            if (!matchesQuery(matcher, key)) {
                continue;
            }

            record.snapshot = {
                ...record.snapshot,
                updatedAt: 0,
            };
            this.notify(record);
        }
    }

    async fetchQuery<T>({
        key,
        fetcher,
        staleTime = 0,
        force = false,
    }: FetchQueryOptions<T>): Promise<T> {
        const record = this.ensureRecord<T>(key);
        const isFresh =
            record.snapshot.updatedAt > 0 &&
            Date.now() - record.snapshot.updatedAt <= staleTime;

        if (!force && isFresh && record.snapshot.data !== undefined) {
            return record.snapshot.data;
        }

        if (record.promise) {
            return record.promise;
        }

        record.snapshot = {
            ...record.snapshot,
            error: null,
            status: "loading",
        };
        this.notify(record);

        const promise = fetcher()
            .then((data) => {
                record.snapshot = {
                    data,
                    error: null,
                    status: "success",
                    updatedAt: Date.now(),
                };
                record.promise = null;
                this.notify(record);
                this.scheduleGc(key, record);
                return data;
            })
            .catch((error) => {
                record.snapshot = {
                    ...record.snapshot,
                    error,
                    status: "error",
                };
                record.promise = null;
                this.notify(record);
                this.scheduleGc(key, record);
                throw error;
            });

        record.promise = promise;
        return promise;
    }
}

export const queryClient = new QueryClient();

export function useQuery<T>({
    key,
    fetcher,
    enabled = true,
    staleTime = 0,
    initialData,
    initialUpdatedAt,
}: UseQueryOptions<T>): UseQueryResult<T> {
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;

    if (initialData !== undefined) {
        queryClient.primeQueryData(key, initialData, initialUpdatedAt);
    }

    const snapshot = useSyncExternalStore(
        (listener) => queryClient.subscribe(key, listener),
        () => queryClient.getSnapshot<T>(key),
        () => queryClient.getSnapshot<T>(key),
    );

    useEffect(() => {
        if (!enabled) {
            return;
        }

        void queryClient.fetchQuery({
            key,
            fetcher: () => fetcherRef.current(),
            staleTime,
        });
    }, [enabled, key, staleTime, snapshot.updatedAt]);

    const refetch = useCallback(async () => {
        if (!enabled) {
            return queryClient.getQueryData<T>(key);
        }

        return queryClient.fetchQuery({
            key,
            fetcher: () => fetcherRef.current(),
            staleTime,
            force: true,
        });
    }, [enabled, key, staleTime]);

    const mutate = useCallback(
        (updater: QueryUpdater<T>) => {
            queryClient.setQueryData(key, updater);
        },
        [key],
    );

    return {
        ...snapshot,
        isLoading: enabled && snapshot.status === "loading" && snapshot.data === undefined,
        isFetching: enabled && snapshot.status === "loading",
        refetch,
        mutate,
    };
}
