import { useState, useEffect } from "react";

export function useNetworkStatus() {
    const [isOnline, setIsOnline] = useState<boolean>(() => {
        const saved = localStorage.getItem("ironclad_connectivity_mode");
        if (saved !== null) {
            return saved === "ONLINE";
        }
        return typeof navigator !== "undefined" ? navigator.onLine : true;
    });

    useEffect(() => {
        const handleOnline = () => {
            const saved = localStorage.getItem("ironclad_connectivity_mode");
            if (saved === null) setIsOnline(true);
        };
        const handleOffline = () => {
            const saved = localStorage.getItem("ironclad_connectivity_mode");
            if (saved === null) setIsOnline(false);
        };

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    const toggleStatus = (online: boolean) => {
        setIsOnline(online);
        localStorage.setItem("ironclad_connectivity_mode", online ? "ONLINE" : "OFFLINE");
        window.dispatchEvent(new Event("ironclad_connectivity_change"));
    };

    useEffect(() => {
        const handleStorageChange = () => {
            const saved = localStorage.getItem("ironclad_connectivity_mode");
            if (saved !== null) {
                setIsOnline(saved === "ONLINE");
            } else if (typeof navigator !== "undefined") {
                setIsOnline(navigator.onLine);
            }
        };

        window.addEventListener("ironclad_connectivity_change", handleStorageChange);
        window.addEventListener("storage", handleStorageChange);
        return () => {
            window.removeEventListener("ironclad_connectivity_change", handleStorageChange);
            window.removeEventListener("storage", handleStorageChange);
        };
    }, []);

    return { isOnline, toggleStatus };
}
