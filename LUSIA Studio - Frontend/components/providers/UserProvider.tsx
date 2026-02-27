"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { StudioUser } from "@/lib/auth";

// ── Split contexts: data vs actions ──
// Components that only need `useUser()` won't re-render when `loading` toggles.

interface UserDataContextType {
    user: StudioUser | null;
}

interface UserActionsContextType {
    loading: boolean;
    refreshUser: () => Promise<void>;
}

const UserDataContext = createContext<UserDataContextType>({ user: null });
const UserActionsContext = createContext<UserActionsContextType>({
    loading: true,
    refreshUser: async () => { },
});

/** Use this when you only need the user object (most components). */
export function useUser() {
    return useContext(UserDataContext);
}

/** Use this when you need loading state or refreshUser. */
export function useUserActions() {
    return useContext(UserActionsContext);
}

interface UserProviderProps {
    children: React.ReactNode;
    initialUser?: StudioUser | null;
}

export function UserProvider({ children, initialUser }: UserProviderProps) {
    const [user, setUser] = useState<StudioUser | null>(initialUser ?? null);
    const [loading, setLoading] = useState(initialUser === undefined);

    const refreshUser = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/auth/me");
            if (res.ok) {
                const data = await res.json();
                if (data.user) {
                    setUser(data.user);
                } else {
                    setUser(null);
                }
            } else {
                setUser(null);
            }
        } catch (e) {
            console.error("Failed to refresh user", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (initialUser !== undefined) {
            setUser(initialUser ?? null);
            setLoading(false);
            return;
        }

        if (!user) {
            void refreshUser();
            return;
        }

        setLoading(false);
    }, [initialUser, user, refreshUser]);

    const dataValue = useMemo(() => ({ user }), [user]);
    const actionsValue = useMemo(() => ({ loading, refreshUser }), [loading, refreshUser]);

    return (
        <UserDataContext.Provider value={dataValue}>
            <UserActionsContext.Provider value={actionsValue}>
                {children}
            </UserActionsContext.Provider>
        </UserDataContext.Provider>
    );
}
