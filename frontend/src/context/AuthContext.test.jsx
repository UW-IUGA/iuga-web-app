/*
 * Purpose: Verify development login refuses to start when the backend is unavailable.
 * Authentication/Authorization Requirements: None; this test uses mocked authentication services.
 * Expected Request: A user activates the sign-in action while the development backend is unavailable.
 * Expected Response: The provider reports a Docker/backend reminder and does not redirect to Microsoft.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider, useAuthContext } from "./AuthContext";

const loginRedirect = vi.fn();

vi.mock("@azure/msal-react", () => ({
  useMsal: () => ({
    instance: { loginRedirect },
    accounts: [],
  }),
}));

function AuthProbe() {
  const { authError, signIn } = useAuthContext();
  return (
    <>
      <button type="button" onClick={signIn}>Sign in</button>
      {authError ? <output>{authError.message}</output> : null}
    </>
  );
}

describe("development sign-in guard", () => {
  beforeEach(() => {
    loginRedirect.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("backend unavailable")));
  });

  test("reminds developers to start Docker when the backend is unavailable", async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
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
