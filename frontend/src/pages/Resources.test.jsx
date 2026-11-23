import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import ResourcesPage from "./Resources";
import { resourceTags } from "../assets/data/Enum";
// Records as in ResourcesData. None has bullets yet, so each card shows its description.
const resources = [
    {
        rName: "UW CLUE Program",
        rDescription: "Academic tutoring and support.",
        rLink: "https://academicsupport.uw.edu/clue/",
        rImage: null,
        type: "UW",
        tags: ["Academic"],
        summary: [],
    },
    {
        rName: "iSchool Career Services (Canvas)",
        rDescription: "Career advising and job search support.",
        rLink: "https://ischool.uw.edu/career",
        rImage: null,
        type: "iSchool",
        tags: ["Jobs & internships"],
        summary: [],
    },
    {
        rName: "Example Student Club",
        rDescription: "A club still writing its description.",
        rLink: "",
        rImage: null,
        type: "Student clubs",
        tags: ["iOrgs"],
        summary: [],
    },
];

const club = (rName, fields = {}) => ({
    rName, rDescription: "A student club.", rLink: "https://example.com", rImage: null, type: "Student clubs", tags: ["Software Engineering"],
    summary: [], ...fields,
});

const CLUBS_ONLY = "/resources?tags=Student+clubs";

// Enough clubs to fill more than one 15-card page.
const manyResources = [
    ...resources.slice(0, 2),
    ...Array.from({ length: 20 }, (_, index) => club(`Club ${String(index + 1).padStart(2, "0")}`)),
];

beforeEach(() => {
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
    delete window.matchMedia;
});

function setScreenWidth(width) {
    window.matchMedia = (query) => ({
        matches: width <= Number(query.match(/max-width: (\d+)px/)[1]),
        media: query,
        addEventListener() {},
        removeEventListener() {},
    });
}

function renderResourcesPage(resourceList = resources, path = "/resources") {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <ResourcesPage resources={resourceList} />
        </MemoryRouter>
    );
}

const resultCards = () => screen.queryAllByRole("article");

describe("ResourcesPage", () => {
    test("shows the page header, Start Here picks, and every resource as a card", () => {
        renderResourcesPage();

        const header = screen.getByRole("region", { name: "Make the most of the iSchool." });
        expect(within(header).getByRole("heading", { level: 1 })).toHaveTextContent("Make the most of the iSchool.");
        expect(within(header).queryByText("iSchool Resources")).not.toBeInTheDocument();
        expect(within(header).getByText(/^IUGA is just one of many RSOs/)).toBeInTheDocument();
        const startHere = screen.getByRole("region", { name: "Start Here" });
        expect(within(startHere).getByText("iSchool Career Services (Canvas)")).toBeInTheDocument();

        expect(resultCards()).toHaveLength(3);
        expect(screen.getByText("3 resources")).toBeInTheDocument();
        const link = screen.getByRole("link", { name: "Learn more about UW CLUE Program (opens in a new tab)" });
        expect(link).toHaveAttribute("href", "https://academicsupport.uw.edu/clue/");
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveClass("pill-button", "pill-button--fill");
    });

    test("shows a logo that is not square whole instead of cropping it", () => {
        renderResourcesPage([club("Wide Logo Club", { rImage: "/wide.png", rImageInset: true })]);

        const card = screen.getByRole("heading", { name: "Wide Logo Club" }).closest("article");
        expect(within(card).getByRole("img", { name: "Wide Logo Club icon" }).parentElement)
            .toHaveClass("resourceIcon", "resourceIcon--inset");
    });

    // The app's ScrollToTop opens new pages at the top and restores the place on Back and Forward.
    test("leaves the scroll position to the app when it opens", () => {
        renderResourcesPage();

        expect(window.scrollTo).not.toHaveBeenCalled();
    });

    test("shows Start Here beside the page title", () => {
        renderResourcesPage();

        const header = screen.getByRole("region", { name: "Make the most of the iSchool." });
        const startHere = within(header).getByRole("region", { name: "Start Here" });
        expect(within(startHere).getByRole("link", { name: /iSchool Career Services \(Canvas\)/ }))
            .toHaveAttribute("href", "https://ischool.uw.edu/career");
    });

    test("tags each card and falls back to the description and a pending note", () => {
        renderResourcesPage();

        const club = screen.getByRole("heading", { name: "Example Student Club" }).closest("article");
        expect(within(club).getByText("Student clubs · iOrgs")).toBeInTheDocument();
        expect(within(club).getByText("A club still writing its description.")).toBeInTheDocument();
        expect(within(club).getByText("Details coming soon")).toBeInTheDocument();
        expect(within(club).queryByRole("link")).not.toBeInTheDocument();
    });

    test("groups the filters by who runs a resource and what it helps with", () => {
        renderResourcesPage();

        const options = (name) => within(screen.getByRole("group", { name }))
            .getAllByRole("checkbox")
            .map((box) => box.closest("label").textContent.replace(/\d+$/, "").trim());
        expect(options("Who runs it")).toEqual(["Student clubs", "iSchool", "UW"]);
        expect(options("What it helps with")).toEqual(["Academic", "Jobs & internships", "Mental Health", "DEI"]);
    });

    // Every club is social, so Social, Career and Community say nothing on this page (they stay on Events).
    test("offers no Social, Career or Community filter", () => {
        renderResourcesPage();

        ["Social", "Career", "Community"].forEach((label) => {
            expect(screen.queryByRole("checkbox", { name: new RegExp(`^${label}`) })).not.toBeInTheDocument();
        });
    });

    test("lists support first, then each club area in Abe's order, when no filter is on", () => {
        renderResourcesPage([
            club("UX Club", { tags: ["UI/UX"] }),
            club("Muslim Students Club", { tags: ["iOrgs"] }),
            club("Hack Club", { tags: ["Entrepreneurship"] }),
            resources[0],
        ]);

        const headings = screen.getAllByRole("heading", { level: 3 }).map(({ textContent }) => textContent);
        expect(headings).toEqual(["Support", "iOrgs", "Entrepreneurship", "UI/UX"]);
        const iOrgs = screen.getByRole("region", { name: "iOrgs" });
        expect(within(iOrgs).getByRole("heading", { level: 4, name: "Muslim Students Club" })).toBeInTheDocument();
        expect(within(screen.getByRole("region", { name: "Support" })).getByRole("heading", { level: 4 }))
            .toHaveTextContent("UW CLUE Program");
    });

    test("shows every resource at once when no filter is on", () => {
        renderResourcesPage(manyResources);

        expect(resultCards()).toHaveLength(22);
        expect(screen.queryByRole("navigation", { name: "Resource pages" })).not.toBeInTheDocument();
    });

    test("switches to one list once a filter is on", () => {
        renderResourcesPage();

        fireEvent.click(screen.getByRole("checkbox", { name: /^UW/ }));

        expect(screen.queryByRole("region", { name: "Support" })).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 3, name: "UW CLUE Program" })).toBeInTheDocument();
            });

    test("lists filtered resources A–Z with no sort menu", () => {
        renderResourcesPage(resources, "/resources?tags=Student+clubs,iSchool,UW");

        const names = resultCards().map((card) => within(card).getByRole("heading").textContent);
        expect(names).toEqual(["Example Student Club", "iSchool Career Services (Canvas)", "UW CLUE Program"]);
        expect(screen.queryByRole("combobox", { name: "Sort" })).not.toBeInTheDocument();
    });

    test("narrows results with tag filters and clears them all", () => {
        renderResourcesPage();
        const clearAll = screen.getByRole("button", { name: "Clear All Filters" });
        expect(clearAll).toBeDisabled();

        fireEvent.click(screen.getByRole("checkbox", { name: /^Jobs & internships/ }));
        fireEvent.change(screen.getByRole("combobox", { name: "Search" }), { target: { value: "advising" } });
        expect(resultCards()).toHaveLength(1);
        expect(screen.getByText("1 resource · Jobs & internships")).toBeInTheDocument();
        expect(clearAll).toBeEnabled();

        fireEvent.click(clearAll);
        expect(resultCards()).toHaveLength(3);
        expect(screen.getByRole("checkbox", { name: /^Jobs & internships/ })).not.toBeChecked();
        expect(screen.getByRole("combobox", { name: "Search" })).toHaveValue("");
        expect(clearAll).toBeDisabled();
    });

    test("invites searching within the results once a tag is picked", () => {
        renderResourcesPage();
        const search = screen.getByRole("combobox", { name: "Search" });
        expect(search).toHaveAttribute("placeholder", "Name, keyword, or tag");

        fireEvent.click(screen.getByRole("checkbox", { name: /^Jobs & internships/ }));

        expect(search).toHaveAttribute("placeholder", "Search these results");
    });

    test("searches by keyword and highlights the match", () => {
        renderResourcesPage();

        fireEvent.change(screen.getByRole("combobox", { name: "Search" }), { target: { value: "tutoring" } });

        expect(resultCards()).toHaveLength(1);
        const card = screen.getByRole("article");
        expect(within(card).getByText("tutoring", { selector: "mark" })).toBeInTheDocument();
    });

    test("opens an older career link filtered to jobs and internships", () => {
        renderResourcesPage(resources, `/resources?category=${resourceTags.CAREER}`);

        expect(screen.getByRole("checkbox", { name: /^Jobs & internships/ })).toBeChecked();
        expect(resultCards()).toHaveLength(1);
    });

    test("opens filtered to the category named in an older link", () => {
        renderResourcesPage(resources, `/resources?category=${resourceTags.ACADEMIC}`);

        expect(screen.getByRole("checkbox", { name: /^Academic/ })).toBeChecked();
        expect(resultCards()).toHaveLength(1);
    });

    test("opens an older student organizations link filtered to student clubs", () => {
        renderResourcesPage(resources, `/resources?category=${resourceTags.COMMUNITY}`);

        expect(screen.getByRole("checkbox", { name: /^Student clubs/ })).toBeChecked();
        expect(resultCards()).toHaveLength(1);
        expect(screen.getByRole("heading", { name: "Example Student Club" })).toBeInTheDocument();
    });

    test("explains when no resource matches the filters", () => {
        renderResourcesPage();

        fireEvent.click(screen.getByRole("checkbox", { name: /^Cybersecurity/ }));

        expect(screen.getByRole("heading", { name: "No resources match those filters." })).toBeInTheDocument();
        const emptyState = screen.getByRole("heading", { name: "No resources match those filters." }).parentElement;
        expect(within(emptyState).getByRole("button", { name: "Clear All Filters" })).toHaveClass("pill-button--fill");
    });

    test("pages through filtered resources 15 at a time", () => {
        renderResourcesPage(manyResources, CLUBS_ONLY);

        expect(resultCards()).toHaveLength(15);
        const pages = screen.getByRole("navigation", { name: "Resource pages" });
        expect(pages).toHaveTextContent("Page 1 of 2");
        expect(within(pages).getByRole("button", { name: /Previous/ })).toBeDisabled();

        fireEvent.click(within(pages).getByRole("button", { name: /Next/ }));

        expect(resultCards()).toHaveLength(5);
        expect(pages).toHaveTextContent("Page 2 of 2");
        expect(within(pages).getByRole("button", { name: /Next/ })).toBeDisabled();
        expect(screen.getByRole("heading", { name: "All Resources" })).toHaveFocus();
    });

    test.each([
        [390, 6],
        [767, 6],
        [768, 8],
        [1023, 8],
        [1024, 12],
        [1299, 12],
        [1300, 15],
    ])("at %ipx wide, shows %i cards to a page", (width, cardsPerPage) => {
        setScreenWidth(width);

        renderResourcesPage(manyResources, CLUBS_ONLY);

        expect(resultCards()).toHaveLength(cardsPerPage);
    });

    test("hides the page controls when everything fits on one page", () => {
        renderResourcesPage();

        expect(screen.queryByRole("navigation", { name: "Resource pages" })).not.toBeInTheDocument();
    });
});
