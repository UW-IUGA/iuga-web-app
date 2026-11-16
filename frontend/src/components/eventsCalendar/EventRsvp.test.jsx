/*
Purpose: The RSVP block in an event's detail: sign-in, the RSVP button and its questions, and the confirmed state.
Authentication/Authorization Requirements: Auth context, runtime mode, and the API are mocked; no sign-in or network.
Expected Request Information: Event details and RSVP requests, each answered by the test.
Expected Response Information: What a student sees about attending an event.
*/
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { normalizeEvent } from "../../utils/calendar/calendar";
import EventDetail from "./EventDetail";
import { EventRsvpProvider } from "./EventRsvpContext";

let isAuthenticated = true;
const signIn = vi.fn();

vi.mock("../../runtime", () => ({ isProduction: true, apiBaseUrl: "" }));

vi.mock("../../context/AuthContext", () => ({
  useAuthContext: () => ({ isAuthenticated, signIn }),
}));

const LISTED = {
  eId: "game-night",
  eName: "Game Night",
  eStartDate: new Date(Date.now() + 86_400_000).toISOString(),
  eLocation: "MGH 120",
  eLabels: ["Social"],
  eThumbnailPath: "/assets/events/game-night.webp",
};

const QUESTION = { qId: "diet", qString: "Any dietary restrictions?" };

const hoursFromNow = (hours) =>
  new Date(Date.now() + hours * 3_600_000).toISOString();

const SIGN_UP_LINK = {
  title: "Register on Handshake",
  url: "https://example.org",
};

const jsonResponse = (body) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => body,
});

// Answers the details request with the given overrides, and every RSVP with rsvpReply.
const mockApi = (
  overrides = {},
  rsvpReply = { status: "success", message: "RSVP recorded" },
) => {
  global.fetch = vi.fn((url) => {
    if (url === "/api/v1/events/rsvp") {
      return Promise.resolve(jsonResponse(rsvpReply));
    }
    return Promise.resolve(
      jsonResponse({
        ...LISTED,
        rsvpEnabled: true,
        rsvpQuestions: [],
        hasRSVPd: false,
        ...overrides,
      }),
    );
  });
};

const renderDetail = ({ listed = LISTED } = {}) =>
  render(
    <EventRsvpProvider>
      <EventDetail event={normalizeEvent(listed)} />
    </EventRsvpProvider>,
  );

const rsvpRequests = () =>
  global.fetch.mock.calls.filter(([url]) => url === "/api/v1/events/rsvp");

beforeEach(() => {
  isAuthenticated = true;
  signIn.mockReset();
});

const detailRequests = () =>
  global.fetch.mock.calls.filter(([url]) =>
    url.startsWith("/api/v1/events/id/"),
  );

// A fresh element each time, so a rerender reaches the provider after the mocked sign-in state changes.
const detailTree = (copies = 1) => (
  <EventRsvpProvider>
    {Array.from({ length: copies }, (_, index) => (
      <EventDetail key={index} event={normalizeEvent(LISTED)} />
    ))}
  </EventRsvpProvider>
);

describe("EventRsvp", () => {
  it("offers the RSVP button once a student signs in with the event open", async () => {
    isAuthenticated = false;
    mockApi();
    const { rerender } = render(detailTree());
    await screen.findByRole("button", { name: "Sign in to RSVP" });

    isAuthenticated = true;
    rerender(detailTree());

    expect(
      await screen.findByRole("button", { name: "RSVP" }),
    ).toBeInTheDocument();
  });

  it("loads an event's details once when it is shown again", async () => {
    mockApi();
    const { rerender } = render(detailTree());
    await screen.findByRole("button", { name: "RSVP" });

    rerender(detailTree(2));

    expect(await screen.findAllByRole("button", { name: "RSVP" })).toHaveLength(
      2,
    );
    expect(detailRequests()).toHaveLength(1);
  });

  it("shows the event's photo", async () => {
    mockApi();
    const { container } = renderDetail();
    expect(container.querySelector(".detail__photo")).toHaveAttribute(
      "src",
      LISTED.eThumbnailPath,
    );
    await screen.findByRole("button", { name: "RSVP" });
  });

  it("asks a signed-out student to sign in, and sends no RSVP", async () => {
    isAuthenticated = false;
    mockApi();
    renderDetail();

    fireEvent.click(
      await screen.findByRole("button", { name: "Sign in to RSVP" }),
    );

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(rsvpRequests()).toHaveLength(0);
  });

  it("sends the answers and then shows the student is going", async () => {
    mockApi({ rsvpQuestions: [QUESTION] });
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "RSVP" }));
    fireEvent.change(screen.getByLabelText(QUESTION.qString), {
      target: { value: "Vegetarian" },
    });
    fireEvent.click(screen.getByRole("button", { name: "RSVP" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "You're on the list",
    );
    expect(JSON.parse(rsvpRequests()[0][1].body)).toEqual({
      eId: "game-night",
      rsvpAnswers: [{ qId: "diet", aString: "Vegetarian" }],
    });
    expect(
      screen.queryByRole("button", { name: "RSVP" }),
    ).not.toBeInTheDocument();
  });

  it("explains a refused RSVP in the popup and keeps the button", async () => {
    mockApi({}, { status: "error", message: "This event is full." });
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "RSVP" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This event is full.",
    );
    expect(screen.getByRole("button", { name: "RSVP" })).toBeEnabled();
    expect(screen.queryByText("You're on the list")).not.toBeInTheDocument();
  });

  it("shows the confirmed state when the server says the student already RSVPd", async () => {
    mockApi({ hasRSVPd: true });
    renderDetail();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "You're on the list",
      ),
    );
  });

  it("tells a student already on the list where the event is", async () => {
    mockApi({ hasRSVPd: true });
    renderDetail();
    // The loading note also has role="status", so wait for the confirmed text itself.
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        `See you at ${LISTED.eLocation}`,
      ),
    );
  });

  it("hides every attendance action once an event has already happened", async () => {
    mockApi({
      showParticipants: true,
      participants: 5,
      eAltLink: SIGN_UP_LINK,
    });
    renderDetail({ listed: { ...LISTED, eStartDate: hoursFromNow(-24) } });

    expect(screen.queryByText("Loading RSVP details…")).not.toBeInTheDocument();
    // The attendance count arrives with the details, so seeing it means the details have loaded.
    expect(await screen.findByText("Attending")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "RSVP" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /More info/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("This event has already happened."),
    ).not.toBeInTheDocument();
  });

  it("hides every attendance action once an event has started, even while it is still going", async () => {
    mockApi({
      showParticipants: true,
      participants: 5,
      eAltLink: SIGN_UP_LINK,
    });
    renderDetail({
      listed: {
        ...LISTED,
        eStartDate: hoursFromNow(-1),
        eEndDate: hoursFromNow(1),
      },
    });

    expect(await screen.findByText("Attending")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "RSVP" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /More info/ }),
    ).not.toBeInTheDocument();
  });

  it.each([-1, 0, 1])(
    "enforces the start cutoff with the event starting in %i ms",
    async (offset) => {
      const now = new Date();
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);
      try {
        mockApi({
          showParticipants: true,
          participants: 5,
          eAltLink: SIGN_UP_LINK,
        });
        renderDetail({
          listed: {
            ...LISTED,
            eStartDate: new Date(now.getTime() + offset).toISOString(),
          },
        });
        await screen.findByText("Attending");
        expect(Boolean(screen.queryByRole("button", { name: "RSVP" }))).toBe(
          offset > 0,
        );
        expect(
          Boolean(
            screen.queryByRole("link", { name: /More info/ }),
          ),
        ).toBe(offset > 0);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("opens the questions before sending anything", async () => {
    mockApi({ rsvpQuestions: [QUESTION] });
    renderDetail();

    const rsvpButton = await screen.findByRole("button", { name: "RSVP" });
    expect(screen.queryByLabelText(QUESTION.qString)).not.toBeInTheDocument();

    fireEvent.click(rsvpButton);

    expect(screen.getByLabelText(QUESTION.qString)).toHaveFocus();
    expect(rsvpRequests()).toHaveLength(0);
  });

  it("RSVPs in one press when there is nothing to ask", async () => {
    mockApi();
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "RSVP" }));

    await waitFor(() => expect(rsvpRequests()).toHaveLength(1));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "You're on the list",
    );
  });

  it("links to the event's own sign-up page when it has no built-in RSVP", async () => {
    mockApi({
      rsvpEnabled: false,
      eAltLink: { title: "Register on Handshake", url: "https://example.org" },
    });
    renderDetail();

    const link = await screen.findByRole("link", {
      name: /More info/,
    });
    expect(link).toHaveAttribute("href", "https://example.org");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("names the platform on the outside link, from its host", async () => {
    mockApi({
      rsvpEnabled: false,
      eAltLink: { url: "https://lu.ma/iuga-workshop" },
    });
    renderDetail();

    expect(
      await screen.findByRole("link", { name: /RSVP on Luma/ }),
    ).toHaveAttribute("href", "https://lu.ma/iuga-workshop");
  });

  it("offers the RSVP and the event's own sign-up link together", async () => {
    mockApi({ rsvpQuestions: [], eAltLink: SIGN_UP_LINK });
    renderDetail();

    expect(
      await screen.findByRole("button", { name: "RSVP" }),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /More info/ });
    expect(link).toHaveAttribute("href", "https://example.org");
  });

  it("says RSVP is not available when the event has neither RSVP nor a sign-up link", async () => {
    mockApi({ rsvpEnabled: false });
    renderDetail();

    expect(
      await screen.findByText("RSVP isn't available for this event."),
    ).toBeInTheDocument();
  });
});
