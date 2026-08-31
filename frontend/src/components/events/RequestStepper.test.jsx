import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, test } from "vitest";
import RequestStepper from "./RequestStepper";

const checkpoints = (completed) => ["proposal", "meeting", "room", "finance", "marketing", "purchases", "review"]
    .map((key) => ({ key, status: completed.includes(key) ? "completed" : "pending" }));

describe("RequestStepper", () => {
    test("marks the first incomplete checkpoint as the active step", () => {
        render(<RequestStepper request={{ status: "FINANCE_REVIEW", checkpoints: checkpoints(["proposal", "meeting", "room"]) }} />);
        const active = screen.getByText("Finance").closest("li");
        expect(active).toHaveAttribute("aria-current", "step");
        expect(screen.getByText("Room").closest("li").className).toContain("--done");
    });

    test("shows a terminal step for rejected requests", () => {
        render(<RequestStepper request={{ status: "REJECTED", checkpoints: checkpoints(["proposal"]) }} />);
        expect(screen.getByText("Rejected")).toBeInTheDocument();
        expect(screen.queryByRole("listitem", { current: "step" })).not.toBeInTheDocument();
    });
});
