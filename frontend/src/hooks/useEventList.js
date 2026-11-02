/*
Purpose: Load the event list the events calendar shows.
Authentication/Authorization Requirements: None. Signed-in visitors get the same list, and it is
  loaded again whenever sign-in state changes.

Expected Request Information:
- None. In production it asks GET /api/v1/events/; elsewhere it uses the sample events, with no request.

Expected Response Information:
- records: the list as the API returns it (eId, eName, eStartDate, eEndDate, eLabels, ...).
- status: "loading" until the first list arrives, "ready" once it has, "failed" if it could not be fetched.
  A list that is already showing stays "ready" while it is refreshed.
- retry: asks for the list again, for a visitor's "Try again" after a failure.
*/

import { useCallback, useEffect, useState } from "react";
import { mockCalendarData } from "../assets/mock-data/MockCalendarData";
import { mockUpcomingEvents } from "../assets/mock-data/MockUpcomingEvents";
import { useAuthContext } from "../context/AuthContext";
import { isProduction } from "../runtime";

const SAMPLE_EVENTS = [...mockCalendarData, ...mockUpcomingEvents];

export default function useEventList() {
    const { isAuthenticated } = useAuthContext();
    const [records, setRecords] = useState([]);
    const [status, setStatus] = useState("loading");
    // Bumped to ask for the list again.
    const [request, setRequest] = useState(0);
    const retry = useCallback(() => setRequest((count) => count + 1), []);

    useEffect(() => {
        if (!isProduction) {
            setRecords(SAMPLE_EVENTS);
            setStatus("ready");
            return undefined;
        }

        let isCurrent = true;
        setStatus((current) => (current === "ready" ? current : "loading"));

        fetch("/api/v1/events/", { method: "GET" })
            .then((res) => {
                if (!res.ok) throw new Error(`${res.status}, ${res.statusText}`);
                return res.json();
            })
            .then((list) => {
                if (!isCurrent) return;
                setRecords(list);
                setStatus("ready");
            })
            .catch((error) => {
                console.error("Unable to load events", error);
                if (isCurrent) setStatus("failed");
            });

        return () => {
            isCurrent = false;
        };
    }, [isAuthenticated, request]);

    return { records, status, retry };
}
