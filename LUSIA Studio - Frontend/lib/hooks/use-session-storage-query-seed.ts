"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PersistedQuerySnapshot<T> {
  updatedAt: number;
  data: T;
}

interface UseSessionStorageQuerySeedOptions<T> {
  storageKey: string;
  initialData?: T | null;
  isValidData?: (value: unknown) => value is T;
}

export function buildSessionStorageQuerySeedKey(
  namespace: string,
  scope: string,
  version = 1,
) {
  return `${namespace}:snapshot:v${version}:${scope}`;
}

function readPersistedQuerySnapshot<T>(
  storageKey: string,
  isValidData?: (value: unknown) => value is T,
): PersistedQuerySnapshot<T> | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PersistedQuerySnapshot<unknown>;
    if (
      typeof parsed?.updatedAt !== "number" ||
      parsed.updatedAt <= 0 ||
      parsed.data === undefined ||
      (isValidData && !isValidData(parsed.data))
    ) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }

    return parsed as PersistedQuerySnapshot<T>;
  } catch {
    return null;
  }
}

export function useSessionStorageQuerySeed<T>({
  storageKey,
  initialData,
  isValidData,
}: UseSessionStorageQuerySeedOptions<T>) {
  const isValidDataRef = useRef(isValidData);
  isValidDataRef.current = isValidData;
  const [persistedSnapshot, setPersistedSnapshot] =
    useState<PersistedQuerySnapshot<T> | null>(() =>
      initialData
        ? null
        : readPersistedQuerySnapshot(storageKey, isValidDataRef.current),
    );

  useEffect(() => {
    if (initialData) {
      setPersistedSnapshot(null);
      return;
    }

    setPersistedSnapshot(
      readPersistedQuerySnapshot(storageKey, isValidDataRef.current),
    );
  }, [initialData, storageKey]);

  const persistSnapshot = useCallback(
    (data: T | undefined, updatedAt: number) => {
      if (data === undefined || updatedAt <= 0) {
        return;
      }

      try {
        window.sessionStorage.setItem(
          storageKey,
          JSON.stringify({
            updatedAt,
            data,
          } satisfies PersistedQuerySnapshot<T>),
        );
      } catch {
        // sessionStorage may be unavailable or full.
      }
    },
    [storageKey],
  );

  return {
    seededData: initialData ?? persistedSnapshot?.data,
    seededUpdatedAt: initialData ? undefined : persistedSnapshot?.updatedAt,
    persistSnapshot,
  };
}
