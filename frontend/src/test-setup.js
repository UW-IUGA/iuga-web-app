import "@testing-library/jest-dom";

// jsdom does not implement the modal <dialog> methods, so tests get the
// minimum that components rely on: the open attribute and the close event.
if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
        this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
        this.removeAttribute("open");
        this.dispatchEvent(new Event("close"));
    };
}
