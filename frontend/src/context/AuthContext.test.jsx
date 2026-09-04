/*
 * Purpose: Verify client authentication context behaviors including local sign-out and environment guards.
 * Authentication/Authorization Requirements: None; unit tests execute with mocked MSAL and fetch interfaces.
 * Expected Request: Actions triggered by users or consumers of useAuthContext (signIn, signOut, accounts change).
 * Expected Response: Predictable client state transitions, backend session invalidation, and local-only MSAL token clearance.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider, useAuthContext } from "./AuthContext";

const loginRedirect = vi.fn();
const logoutRedirect = vi.fn();
let mockAccounts = [];
const ensureBackendAuthentication = vi.fn();

vi.mock("@azure/msal-react", () => ({
  useMsal: () => ({
    instance: {
      loginRedirect,
      logoutRedirect,
    },
    accounts: mockAccounts,
  }),
}));

vi.mock("../hooks/useAuth", () => ({
  default: () => ({
    ensureBackendAuthentication,
  }),
}));

function AuthProbe() {
  const { user, isAuthenticated, authError, signIn, signOut } = useAuthContext();
  return (
    <div>
      <button type="button" onClick={signIn}>Sign in</button>
      <button type="button" onClick={signOut}>Sign out</button>
      <output data-testid="auth-status">
        {isAuthenticated ? `signed-in:${user?.email || "unknown"}` : "signed-out"}
      </output>
      {authError ? <output data-testid="auth-error">{authError.message}</output> : null}
    </div>
  );
}

describe("AuthContext - Local Sign-Out (Option A)", () => {
  const dummyAccount = {
    homeAccountId: "test-home-id",
    username: "student@uw.edu",
    name: "UW Student",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    logoutRedirect.mockReset();
    loginRedirect.mockReset();
    mockAccounts = [dummyAccount];
    ensureBackendAuthentication.mockResolvedValue({
      email: "student@uw.edu",
      displayName: "UW Student",
      uType: "Member",
    });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url) => {
      if (url === "/api/v1/user/logout") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: "success" }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: "success" }),
      });
    }));
  });

  test("signs out locally: terminates server session, suppresses external navigation, and transitions UI to signed-out", async () => {
    let attemptedExternalUrl = null;
    logoutRedirect.mockImplementation(async (request) => {
      if (typeof request?.onRedirectNavigate === "function") {
        const shouldNavigate = request.onRedirectNavigate("https://login.microsoftonline.com/tenant/oauth2/v2.0/logout");
        if (shouldNavigate !== false) {
          attemptedExternalUrl = "https://login.microsoftonline.com/tenant/oauth2/v2.0/logout";
        }
      } else {
        attemptedExternalUrl = "https://login.microsoftonline.com/tenant/oauth2/v2.0/logout";
      }
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    // Initial sign-in sync from accounts
    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("signed-in:student@uw.edu");
    });

    // Trigger local sign-out
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    // Verifies backend session termination request was sent
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/v1/user/logout", expect.objectContaining({
        method: "POST",
      }));
    });

    // Verifies user is immediately signed out in the UI
    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("signed-out");
    });

    // Verifies external redirect to Microsoft was completely suppressed
    expect(attemptedExternalUrl).toBeNull();
  });

  test("resets client auth state to signed-out even if backend session termination fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url) => {
      if (url === "/api/v1/user/logout") {
        return Promise.reject(new Error("Network connection lost"));
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("signed-in:student@uw.edu");
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("signed-out");
    });
  });

  test("clears cache without account when accounts array is empty", async () => {
    mockAccounts = [];
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("signed-out");
    });
  });

  test("captures auth error and clears state when MSAL logout rejects", async () => {
    logoutRedirect.mockRejectedValueOnce(new Error("Storage unavailable"));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("signed-in:student@uw.edu");
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(screen.getByTestId("auth-error")).toHaveTextContent("Storage unavailable");
    });
    expect(screen.getByTestId("auth-status")).toHaveTextContent("signed-out");
  });

  test("handles non-2xx HTTP status from backend logout without throwing unhandled error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url) => {
      if (url === "/api/v1/user/logout") {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ status: "error", message: "Session store failed" }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("signed-in:student@uw.edu");
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(logoutRedirect).toHaveBeenCalled();
    });
    expect(screen.getByTestId("auth-status")).toHaveTextContent("signed-out");
  });

  test("in-flight authenticate resolution after signOut does not resurrect signed-in state", async () => {
    let resolveAuth;
    const pendingAuthPromise = new Promise((res) => {
      resolveAuth = res;
    });
    ensureBackendAuthentication.mockReturnValue(pendingAuthPromise);

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    // User triggers sign out while initial authentication promise is still in-flight
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(logoutRedirect).toHaveBeenCalled();
    });
    expect(screen.getByTestId("auth-status")).toHaveTextContent("signed-out");

    // Delayed token authentication finally resolves after sign-out completed
    resolveAuth({
      email: "student@uw.edu",
      displayName: "UW Student",
      uType: "Member",
    });

    // Verify the state remains signed-out and was not resurrected
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId("auth-status")).toHaveTextContent("signed-out");
  });

  test("transitions to signed-out when accounts array becomes empty", async () => {
    const { rerender } = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("signed-in:student@uw.edu");
    });

    // Simulate MSAL account removal from external event or tab
    mockAccounts = [];
    rerender(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("signed-out");
    });
  });
});

describe("development sign-in guard", () => {
  beforeEach(() => {
    mockAccounts = [];
    loginRedirect.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("backend unavailable")));
  });

  test("reminds developers to start Docker when backend is unavailable", async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const dialog = await screen.findByRole("dialog", { name: /local sign-in unavailable/i });
    expect(dialog).toHaveTextContent(/docs\/TROUBLESHOOTING\.md#local-development-sign-in/i);
    expect(screen.getByRole("button", { name: "I understand" })).toBeInTheDocument();
    expect(loginRedirect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "I understand" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /local sign-in unavailable/i })).not.toBeInTheDocument();
    });
  });
});
