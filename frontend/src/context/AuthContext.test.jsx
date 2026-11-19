/*
 * Purpose: Sign-in failure dialog and officer permission regressions.
 * Authentication/Authorization Requirements: MSAL and the backend API are mocked; no live sign-in.
 * Expected Request Information: A cached Microsoft account and a backend login or readiness response.
 * Expected Response Information: The dialog heading and message a student sees when sign-in fails.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuthContext } from "./AuthContext";

const msal = vi.hoisted(() => ({
    accounts: [{ homeAccountId: "student-1" }],
    instance: { acquireTokenSilent: vi.fn(), loginPopup: vi.fn() },
}));
vi.mock("@azure/msal-react", () => ({ useMsal: () => msal }));

function SignInButton() {
    const { signIn } = useAuthContext();
    return <button onClick={signIn}>Sign in</button>;
}

function mockLoginStatus(status, headers = {}) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (url === "/api/v1/user/login") return { ok: false, status, headers: new Headers(headers), json: async () => ({}) };
        throw new Error(`Unexpected API request: ${url}`);
    });
}

beforeEach(() => {
    msal.accounts = [{ homeAccountId: "student-1" }];
    msal.instance.acquireTokenSilent.mockResolvedValue({ accessToken: "token" });
    vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("sign-in failure dialog", () => {
    it("tells the student how long to wait when the backend is limiting requests", async () => {
        mockLoginStatus(429, { "Retry-After": "840" });
        render(<AuthProvider />);

        const dialog = await screen.findByRole("dialog");
        expect(dialog).toHaveTextContent("We couldn't sign you in");
        expect(dialog).toHaveTextContent("Try again in about 14 minutes.");
        expect(dialog).not.toHaveTextContent("Local");
    });

    it("gives no wait time when a limited response does not send one", async () => {
        mockLoginStatus(429);
        render(<AuthProvider />);

        expect(await screen.findByRole("dialog")).toHaveTextContent("Try again in a few minutes.");
    });

    it("names the status when the backend rejects the sign-in", async () => {
        mockLoginStatus(502);
        render(<AuthProvider />);

        const dialog = await screen.findByRole("dialog");
        expect(dialog).toHaveTextContent("We couldn't sign you in");
        expect(dialog).toHaveTextContent("(status 502)");
        expect(dialog).not.toHaveTextContent("Local");
    });

    it("keeps the local setup guidance when the development backend is not running", async () => {
        msal.accounts = [];
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection refused"));
        render(
            <AuthProvider>
                <SignInButton />
            </AuthProvider>
        );

        fireEvent.click(screen.getByText("Sign in"));

        const dialog = await screen.findByRole("dialog");
        expect(dialog).toHaveTextContent("Local environment");
        expect(dialog).toHaveTextContent("Local sign-in unavailable");
    });
});

describe("officer permissions", () => {
    function OrderReviewAccess() {
        const { can, signOut } = useAuthContext();
        return (
            <>
                <p>{can("shop.purchases.review") ? "Can review orders" : "Cannot review orders"}</p>
                <button onClick={signOut}>Sign out</button>
            </>
        );
    }

    const granted = (permissions) => () => ({ ok: true, status: 200, json: async () => ({ status: "success", permissions }) });
    const requestedUrls = (fetchSpy) => fetchSpy.mock.calls.map(([url]) => url);

    function mockSignedIn(user, permissionsResponse) {
        return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
            if (url === "/api/v1/user/login") return { ok: true, status: 200, json: async () => user };
            if (url === "/api/v1/user/permissions") return permissionsResponse();
            if (url === "/api/v1/user/logout") return { ok: true, status: 200, json: async () => ({}) };
            throw new Error(`Unexpected API request: ${url}`);
        });
    }

    beforeEach(() => {
        msal.instance.logoutRedirect = vi.fn().mockResolvedValue(undefined);
    });

    it("allows what the user's roles grant, whatever their account type", async () => {
        mockSignedIn({ uType: "Member", uFirstName: "Olive" }, granted(["shop.purchases.review"]));
        render(<AuthProvider><OrderReviewAccess /></AuthProvider>);

        expect(await screen.findByText("Can review orders")).toBeInTheDocument();
    });

    it("allows nothing an Admin account's roles leave out", async () => {
        const fetchSpy = mockSignedIn({ uType: "Admin" }, granted(["events.finance.manage"]));
        render(<AuthProvider><OrderReviewAccess /></AuthProvider>);

        await waitFor(() => expect(requestedUrls(fetchSpy)).toContain("/api/v1/user/permissions"));
        expect(screen.getByText("Cannot review orders")).toBeInTheDocument();
    });

    it("offers no officer tools, without a sign-in error, when the check fails", async () => {
        const fetchSpy = mockSignedIn({ uType: "Member" }, () => ({ ok: false, status: 500, json: async () => ({}) }));
        render(<AuthProvider><OrderReviewAccess /></AuthProvider>);

        await waitFor(() => expect(requestedUrls(fetchSpy)).toContain("/api/v1/user/permissions"));
        expect(screen.getByText("Cannot review orders")).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("forgets permissions on sign-out", async () => {
        mockSignedIn({ uType: "Member" }, granted(["shop.purchases.review"]));
        render(<AuthProvider><OrderReviewAccess /></AuthProvider>);
        await screen.findByText("Can review orders");

        fireEvent.click(screen.getByText("Sign out"));

        expect(await screen.findByText("Cannot review orders")).toBeInTheDocument();
    });
});
