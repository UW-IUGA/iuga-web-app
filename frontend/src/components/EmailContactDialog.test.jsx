/*
 * Purpose: Email contact dialog behavior: the prefilled draft, compose links, and the optional
 *          "did you send it?" step that follows opening a compose link.
 * Authentication/Authorization Requirements: None; no mail is sent.
 * Expected Request Information: A draft or a list of templates, and optionally a follow-up confirmation.
 * Expected Response Information: Visible dialog steps and confirmation callbacks.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import EmailContactDialog from "./EmailContactDialog";

const draft = { recipient: "example@uw.edu", subject: "Your IUGA order", body: "Hi Example," };
const readyTemplate = {
    id: "ready",
    label: "Ready for pickup",
    draft: { recipient: "example@uw.edu", subject: "Your order is ready", body: "Hi Example, your order is ready." },
};
const shippedTemplate = {
    id: "shipped",
    label: "Shipped",
    draft: { recipient: "example@uw.edu", subject: "Your order shipped", body: "Hi Example, your order shipped." },
};

function renderDialog(props = {}) {
    return render(
        <EmailContactDialog draft={draft} contextLabel="Order ...0123" title="Email about this order" triggerLabel="Email student" {...props} />
    );
}

// Opening a compose link would navigate jsdom; the click handler is what matters here.
function openGmail() {
    const link = screen.getByRole("link", { name: "Open in Gmail" });
    link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(link);
}

// Returns the decoded query parameters of a compose link, as the mail provider reads them.
function composeParams(linkName) {
    return new URL(screen.getByRole("link", { name: linkName }).getAttribute("href")).searchParams;
}

afterEach(cleanup);

describe("EmailContactDialog", () => {
    it("shows the draft and compose links, and stays on the draft after a link opens when no follow-up is asked", () => {
        renderDialog();
        fireEvent.click(screen.getByRole("button", { name: "Email student" }));

        expect(screen.getByText("example@uw.edu")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Open in Gmail" }).getAttribute("href")).toContain("to=example%40uw.edu");
        openGmail();
        expect(screen.queryByText("Did you send the email?")).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Open in Outlook" })).toBeInTheDocument();
    });

    it("asks whether the email was sent after a compose link opens, and records nothing when it was not", () => {
        const onConfirm = vi.fn();
        renderDialog({ followUp: { confirmLabel: "Yes, mark awaiting reply", onConfirm } });
        fireEvent.click(screen.getByRole("button", { name: "Email student" }));

        openGmail();
        expect(screen.getByRole("heading", { name: "Did you send the email?" })).toHaveFocus();
        expect(screen.getByText("Opening Gmail or Outlook doesn't confirm it was sent.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Not sent" }));

        expect(onConfirm).not.toHaveBeenCalled();
        expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute("open");
        fireEvent.click(screen.getByRole("button", { name: "Email student" }));
        expect(screen.getByRole("link", { name: "Open in Gmail" })).toBeInTheDocument();
    });

    it("confirms once when the officer says the email was sent", () => {
        const onConfirm = vi.fn();
        renderDialog({ followUp: { confirmLabel: "Yes, mark awaiting reply", onConfirm } });
        fireEvent.click(screen.getByRole("button", { name: "Email student" }));

        openGmail();
        fireEvent.click(screen.getByRole("button", { name: "Yes, mark awaiting reply" }));

        expect(onConfirm).toHaveBeenCalledOnce();
        expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute("open");
    });

    it("cannot be opened when its trigger is disabled", () => {
        renderDialog({ disabled: true });
        expect(screen.getByRole("button", { name: "Email student" })).toBeDisabled();
    });

    it("uses the page's trigger class in place of the default one", () => {
        renderDialog({ triggerClassName: "page-trigger" });
        const trigger = screen.getByRole("button", { name: "Email student" });

        expect(trigger).toHaveClass("page-trigger");
        expect(trigger).not.toHaveClass("emailContactDialog__trigger");
    });

    it("offers a template picker that starts on the first template", () => {
        renderDialog({ templates: [readyTemplate, shippedTemplate] });
        fireEvent.click(screen.getByRole("button", { name: "Email student" }));

        expect(screen.getByRole("combobox", { name: "Template" })).toHaveDisplayValue("Ready for pickup");
        expect(screen.getByRole("option", { name: "Ready for pickup" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "Shipped" })).toBeInTheDocument();
        expect(screen.queryByText("Your IUGA order")).not.toBeInTheDocument();
        expect(screen.getByText("Your order is ready")).toBeInTheDocument();
        expect(screen.getByText("Hi Example, your order is ready.")).toBeInTheDocument();
        expect(composeParams("Open in Gmail").get("su")).toBe("Your order is ready");
        expect(composeParams("Open in Gmail").get("body")).toBe("Hi Example, your order is ready.");
        expect(composeParams("Open in Outlook").get("subject")).toBe("Your order is ready");
        expect(composeParams("Open in Outlook").get("body")).toBe("Hi Example, your order is ready.");
    });

    it("updates the preview and both compose links when another template is chosen", () => {
        renderDialog({ templates: [readyTemplate, shippedTemplate] });
        fireEvent.click(screen.getByRole("button", { name: "Email student" }));

        fireEvent.change(screen.getByRole("combobox", { name: "Template" }), { target: { value: "shipped" } });

        expect(screen.getByText("Your order shipped")).toBeInTheDocument();
        expect(screen.getByText("Hi Example, your order shipped.")).toBeInTheDocument();
        expect(composeParams("Open in Gmail").get("su")).toBe("Your order shipped");
        expect(composeParams("Open in Gmail").get("body")).toBe("Hi Example, your order shipped.");
        expect(composeParams("Open in Outlook").get("subject")).toBe("Your order shipped");
        expect(composeParams("Open in Outlook").get("body")).toBe("Hi Example, your order shipped.");
    });

    it("starts each opening on the first template again", () => {
        renderDialog({ templates: [readyTemplate, shippedTemplate] });
        fireEvent.click(screen.getByRole("button", { name: "Email student" }));
        fireEvent.change(screen.getByRole("combobox", { name: "Template" }), { target: { value: "shipped" } });
        fireEvent.click(screen.getByRole("button", { name: "Close contact options" }));

        fireEvent.click(screen.getByRole("button", { name: "Email student" }));

        expect(screen.getByRole("combobox", { name: "Template" })).toHaveDisplayValue("Ready for pickup");
        expect(screen.getByText("Your order is ready")).toBeInTheDocument();
    });

    it("shows no template picker when there is only one template", () => {
        renderDialog({ templates: [readyTemplate] });
        fireEvent.click(screen.getByRole("button", { name: "Email student" }));

        expect(screen.getByText("Your order is ready")).toBeInTheDocument();
        expect(screen.queryByRole("combobox", { name: "Template" })).not.toBeInTheDocument();
    });

    it("asks the follow-up question of the chosen template and confirms through its callback", () => {
        const onReadyConfirm = vi.fn();
        const onShippedConfirm = vi.fn();
        renderDialog({
            templates: [
                { ...readyTemplate, followUp: { confirmLabel: "Yes, mark ready sent", onConfirm: onReadyConfirm } },
                { ...shippedTemplate, followUp: { confirmLabel: "Yes, mark shipped sent", onConfirm: onShippedConfirm } },
            ],
        });
        fireEvent.click(screen.getByRole("button", { name: "Email student" }));
        fireEvent.change(screen.getByRole("combobox", { name: "Template" }), { target: { value: "shipped" } });

        openGmail();
        fireEvent.click(screen.getByRole("button", { name: "Yes, mark shipped sent" }));

        expect(onShippedConfirm).toHaveBeenCalledOnce();
        expect(onReadyConfirm).not.toHaveBeenCalled();
    });

    it("skips the sent check when the chosen template has no follow-up, even if the dialog has one", () => {
        renderDialog({
            followUp: { confirmLabel: "Yes, mark awaiting reply", onConfirm: vi.fn() },
            templates: [readyTemplate, shippedTemplate],
        });
        fireEvent.click(screen.getByRole("button", { name: "Email student" }));

        openGmail();

        expect(screen.queryByText("Did you send the email?")).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Open in Outlook" })).toBeInTheDocument();
    });
});
