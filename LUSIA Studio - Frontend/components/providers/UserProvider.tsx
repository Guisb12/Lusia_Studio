"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { StudioUser } from "@/lib/auth";

interface UserContextType {
    user: StudioUser | null;
    loading: boolean;
    refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
    user: null,
    loading: true,
    refreshUser: async () => { },
});

export function useUser() {
    return useContext(UserContext);
}

interface UserProviderProps {
    children: React.ReactNode;
    initialUser?: StudioUser | null;
}

export function UserProvider({ children, initialUser }: UserProviderProps) {
    const [user, setUser] = useState<StudioUser | null>(initialUser ?? null);
    const [loading, setLoading] = useState(initialUser === undefined);

    const refreshUser = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/auth/me"); // This hits our NextJS route handler which calls backend
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
    };

    // If initialUser was not provided (e.g. client navigation to a page that didn't prefetch), fetch it.
    // But our layout usually fetches it.
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
    }, [initialUser, user]);

    return (
        <UserContext.Provider value={{ user, loading, refreshUser }}>
            {children}
        </UserContext.Provider>
    );
}
