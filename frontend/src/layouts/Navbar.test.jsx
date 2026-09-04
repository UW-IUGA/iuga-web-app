/*
 * Purpose: Verify Navbar authentication UI transitions between signed-in and signed-out states.
 * Authentication/Authorization Requirements: None; unit tests execute with mocked auth context.
 * Expected Request: Render Navbar under MemoryRouter with varying isAuthenticated values and user interactions.
 * Expected Response: Accessible greeting, Logout CTA, and seamless transition to UW NetID Login when logged out.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import Navbar from "./Navbar";
import { useAuthContext } from "../context/AuthContext";

vi.mock("../context/AuthContext", () => ({
  useAuthContext: vi.fn(),
}));

describe("Navbar authentication controls", () => {
  test("renders Logout action when authenticated and triggers signOut on click", () => {
    const signOut = vi.fn();
    const signIn = vi.fn();
    useAuthContext.mockReturnValue({
      isAuthenticated: true,
      user: { uFirstName: "Jane", uType: "Officer" },
    });

    render(
      <MemoryRouter>
        <Navbar signIn={signIn} signOut={signOut} />
      </MemoryRouter>
    );

    expect(screen.getByText(/Hi, Jane/i)).toBeInTheDocument();
    const logoutButtons = screen.getAllByRole("button", { name: /logout/i });
    expect(logoutButtons).toHaveLength(2);

    fireEvent.click(logoutButtons[0]);
    expect(signOut).toHaveBeenCalledTimes(1);

    fireEvent.click(logoutButtons[1]);
    expect(signOut).toHaveBeenCalledTimes(2);
    expect(signIn).not.toHaveBeenCalled();
  });

  test("renders UW NetID Login when unauthenticated and triggers signIn on click", () => {
    const signOut = vi.fn();
    const signIn = vi.fn();
    useAuthContext.mockReturnValue({
      isAuthenticated: false,
      user: {},
    });

    render(
      <MemoryRouter>
        <Navbar signIn={signIn} signOut={signOut} />
      </MemoryRouter>
    );

    const loginButton = screen.getByRole("button", { name: "UW NetID Login" });
    expect(loginButton).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /logout/i })).not.toBeInTheDocument();

    fireEvent.click(loginButton);
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });
});
