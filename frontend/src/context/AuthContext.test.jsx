/*
 * Purpose: Sign-in failure dialog regressions.
 * Authentication/Authorization Requirements: MSAL and the backend API are mocked; no live sign-in.
 * Expected Request Information: A cached Microsoft account and a backend login or readiness response.
 * Expected Response Information: The dialog heading and message a student sees when sign-in fails.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
