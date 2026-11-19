import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useState } from "react";
import { useModalDialog } from "./useModalDialog";

// A parent that keeps the open flag in its own state, as the pages do.
function DialogParent({ onClose, children = null }) {
    const [isOpen, setIsOpen] = useState(false);
    const { dialogProps, close } = useModalDialog(isOpen, () => {
        onClose();
        setIsOpen(false);
    });

    return (
        <>
            <button type="button" onClick={() => setIsOpen(true)}>
                Open sample
            </button>
            <dialog aria-label="Sample" {...dialogProps}>
                <p>Sample text</p>
                {children}
                <button type="button" onClick={close}>
                    Close sample
                </button>
            </dialog>
        </>
    );
}

const openSample = () => fireEvent.click(screen.getByRole("button", { name: "Open sample" }));

describe("useModalDialog", () => {
    test.each([
        [
            "the close button",
            () => fireEvent.click(screen.getByRole("button", { name: "Close sample" })),
        ],
        [
            "Escape",
            () => {
                const dialog = screen.getByRole("dialog");
                act(() => {
                    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
                    dialog.close();
                });
            },
        ],
        ["a click on the dimmed area", () => fireEvent.click(screen.getByRole("dialog"))],
    ])("closing with %s reports the close once and the dialog opens again", (_, closeWith) => {
        const onClose = vi.fn();
        render(<DialogParent onClose={onClose} />);

        openSample();
        closeWith();

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        openSample();

        expect(screen.getByRole("dialog", { name: "Sample" })).toBeInTheDocument();
    });

    test("closing a dialog nested inside it does not close it", () => {
        const onClose = vi.fn();
        render(
            <DialogParent onClose={onClose}>
                <dialog aria-label="Inner" open />
            </DialogParent>
        );
        openSample();

        act(() => screen.getByRole("dialog", { name: "Inner" }).close());

        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole("dialog", { name: "Sample" })).toBeInTheDocument();
    });
});
