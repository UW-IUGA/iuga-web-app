import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, test, vi } from "vitest";
import ReasonModal from "./ReasonModal";

describe("ReasonModal", () => {
    test("requires a non-empty reason before confirming", () => {
        const onConfirm = vi.fn();
        render(<ReasonModal title="Reject request" label="Why?" confirmLabel="Reject" onConfirm={onConfirm} onCancel={vi.fn()} />);

        const confirm = screen.getByRole("button", { name: "Reject" });
        expect(confirm).toBeDisabled();

        fireEvent.change(screen.getByRole("textbox", { name: "Why?" }), { target: { value: "  Out of scope  " } });
        fireEvent.click(confirm);

        expect(onConfirm).toHaveBeenCalledWith("Out of scope");
    });

    test("cancels without confirming", () => {
        const onCancel = vi.fn();
        render(<ReasonModal title="Return" label="What to fix?" onConfirm={vi.fn()} onCancel={onCancel} />);
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onCancel).toHaveBeenCalled();
    });
});
