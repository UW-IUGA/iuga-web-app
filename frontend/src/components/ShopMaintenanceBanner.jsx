/*
Purpose: Warn a student who has items in their cart about announced shop maintenance, on every page,
         so they can finish checking out before it starts.

Authentication/Authorization Requirements: None; the shop status is public.

Expected Request Information: The cart from ShopCartContext. A student with an empty cart sees
         nothing and no request is made.

Expected Response Information: GET /api/v1/shop/status gives { shop: { checkoutPaused, maintenanceAt } }.
         Shows a countdown to the maintenance time, then a paused notice, or nothing.
*/

import { useEffect, useState } from "react";
import { useShopCart } from "../context/ShopCartContext";

const STATUS_REFRESH_MS = 60_000;

function formatClock(isoString) {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(isoString));
}

function formatRemaining(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
}

function ShopMaintenanceBanner() {
    const { cart } = useShopCart();
    const hasItems = cart.length > 0;
    const [status, setStatus] = useState(null);
    const [nowMs, setNowMs] = useState(() => Date.now());

    useEffect(() => {
        if (!hasItems) {
            setStatus(null);
            return undefined;
        }
        let cancelled = false;
        const load = async () => {
            try {
                const response = await fetch("/api/v1/shop/status");
                if (!response.ok) return;
                const body = await response.json();
                if (!cancelled) setStatus(body?.shop ?? null);
            } catch {
                // The banner is a courtesy. When the status cannot be read, the last known one stays.
            }
        };
        load();
        const timer = setInterval(load, STATUS_REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [hasItems]);

    const maintenanceAtMs = status?.maintenanceAt ? Date.parse(status.maintenanceAt) : null;

    useEffect(() => {
        if (maintenanceAtMs === null) return undefined;
        setNowMs(Date.now());
        const timer = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [maintenanceAtMs]);

    if (!hasItems || !status) return null;

    const remainingMs = maintenanceAtMs === null ? null : maintenanceAtMs - nowMs;
    if (remainingMs !== null && remainingMs > 0) {
        return (
            <div className="shopMaintenanceBanner" role="status">
                <p>
                    <strong>Shop maintenance at {formatClock(status.maintenanceAt)}.</strong>{" "}
                    Checkout closes then, so finish checking out before it starts.
                </p>
                {/* The ticking time is for sighted readers; announcing it every second would drown out the page. */}
                <p className="shopMaintenanceBanner__countdown" aria-hidden="true">
                    {formatRemaining(remainingMs)} left
                </p>
            </div>
        );
    }

    if (status.checkoutPaused || remainingMs !== null) {
        return (
            <div className="shopMaintenanceBanner shopMaintenanceBanner--paused" role="status">
                <p>
                    <strong>Shop checkout is paused for maintenance.</strong>{" "}
                    Your cart is saved. Please try again in a few minutes.
                </p>
            </div>
        );
    }

    return null;
}

export default ShopMaintenanceBanner;
