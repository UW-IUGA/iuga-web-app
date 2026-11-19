/*
Purpose: Drive a native modal <dialog> from an isOpen flag, so components never
         call showModal() or close() themselves.

Expected Request Information:
- isOpen: whether the dialog should be open.
- onClose: called once each time the dialog closes, however it was closed. It
  must clear whatever makes isOpen true, or the dialog cannot open again.

Expected Response Information:
- dialogProps: spread onto the <dialog>.
- close: call from a close button.
Escape, close(), and a press that both starts and ends on the dimmed area
around the content all end in the dialog's own close event, which is the one
place onClose is called from. React passes a nested dialog's close event up to
this dialog's handler too, so those are ignored.
*/

import { useCallback, useEffect, useRef } from "react";

export const useModalDialog = (isOpen, onClose) => {
    const dialogRef = useRef(null);
    // Set when a press started or ended on the content, such as selecting text; the click that follows is not a close.
    const pressedInContent = useRef(false);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (isOpen && !dialog.open) dialog.showModal();
        if (!isOpen && dialog.open) dialog.close();
    }, [isOpen]);

    const close = useCallback(() => dialogRef.current?.close(), []);

    const trackPressStart = (pressEvent) => {
        pressedInContent.current = pressEvent.target !== dialogRef.current;
    };

    const trackPressEnd = (releaseEvent) => {
        if (releaseEvent.target !== dialogRef.current) pressedInContent.current = true;
    };

    const reportOwnClose = (closeEvent) => {
        if (closeEvent.target === dialogRef.current) onClose(closeEvent);
    };

    const closeOnBackdropClick = (clickEvent) => {
        const wasPressedInContent = pressedInContent.current;
        pressedInContent.current = false;
        if (clickEvent.target === dialogRef.current && !wasPressedInContent) close();
    };

    return {
        dialogProps: {
            ref: dialogRef,
            onClose: reportOwnClose,
            onMouseDown: trackPressStart,
            onMouseUp: trackPressEnd,
            onClick: closeOnBackdropClick,
        },
        close,
    };
};
