import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, test } from "vitest";
import RequestStepper from "./RequestStepper";

const checkpoints = (completed) => ["proposal", "meeting", "room", "finance", "marketing", "purchases", "review"]
    .map((key) => ({ key, status: completed.includes(key) ? "completed" : "pending" }));

describe("RequestStepper", () => {
    test("folds room booking into the Finance step and keeps it active until both are done", () => {
        render(<RequestStepper request={{ status: "FINANCE_REVIEW", checkpoints: checkpoints(["proposal", "meeting", "room"]) }} />);

        expect(screen.queryByText("Room")).not.toBeInTheDocument();
        expect(screen.getByText("Finance").closest("li")).toHaveAttribute("aria-current", "step");
        expect(screen.getByText("Meeting").closest("li").className).toContain("--done");
    });

    test("completes the Finance step once room and finance checkpoints are both done", () => {
        render(<RequestStepper request={{ status: "MARKETING_QUEUED", checkpoints: checkpoints(["proposal", "meeting", "room", "finance"]) }} />);

        expect(screen.getByText("Finance").closest("li").className).toContain("--done");
        expect(screen.getByText("Marketing").closest("li")).toHaveAttribute("aria-current", "step");
    });

    test("adds a Publish step that stays active while a scheduled event is unpublished", () => {
        render(<RequestStepper request={{ status: "SCHEDULED", publishedEventId: null, checkpoints: checkpoints(["proposal", "meeting", "room", "finance", "marketing"]) }} />);

        expect(screen.getByText("Publish").closest("li")).toHaveAttribute("aria-current", "step");
        expect(screen.getByText("Marketing").closest("li").className).toContain("--done");
    });

    test("marks Publish done and advances to Purchases once published", () => {
        render(<RequestStepper request={{ status: "SCHEDULED", publishedEventId: "event-1", checkpoints: checkpoints(["proposal", "meeting", "room", "finance", "marketing"]) }} />);

        expect(screen.getByText("Publish").closest("li").className).toContain("--done");
        expect(screen.getByText("Purchases").closest("li")).toHaveAttribute("aria-current", "step");
    });

    test("shows a terminal step for rejected requests", () => {
        render(<RequestStepper request={{ status: "REJECTED", checkpoints: checkpoints(["proposal"]) }} />);

        expect(screen.getByText("Rejected")).toBeInTheDocument();
        expect(screen.queryByRole("listitem", { current: "step" })).not.toBeInTheDocument();
    });
});
