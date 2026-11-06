import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import ResourcesPage from "./Resources";
import { resourceTags } from "../assets/data/Enum";

const resources = Object.fromEntries(Object.values(resourceTags).map((category) => [category, []]));
resources[resourceTags.ACADEMIC] = [
    {
        rName: "UW CLUE Program",
        rDescription: "Academic tutoring and support.",
        rLink: "https://academicsupport.uw.edu/clue/",
        rImage: null,
    },
];
resources[resourceTags.CAREER] = [
    {
        rName: "iSchool Career Services (Canvas)",
        rDescription: "Career advising and job search support.",
        rLink: "https://ischool.uw.edu/career",
        rImage: null,
    },
];
resources[resourceTags.COMMUNITY] = [
    {
        rName: "Example Student Club",
        rDescription: "A club still writing its description.",
        rLink: "",
        rImage: null,
    },
];

// Enough community resources to fill more than one 15-card page.
const manyResources = {
    ...resources,
    [resourceTags.COMMUNITY]: Array.from({ length: 20 }, (_, index) => ({
        rName: `Club ${String(index + 1).padStart(2, "0")}`,
        rDescription: "A student club.",
        rLink: "https://example.com",
        rImage: null,
    })),
};

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
        expect(within(header).getByText("iSchool Resources")).toBeInTheDocument();
        expect(within(header).getByText(/^IUGA is just one of many RSOs/)).toBeInTheDocument();
        const startHere = screen.getByRole("region", { name: "Start Here" });
        expect(within(startHere).getByText("iSchool Career Services (Canvas)")).toBeInTheDocument();

        expect(resultCards()).toHaveLength(3);
        expect(screen.getByText("3 resources")).toBeInTheDocument();
        const link = screen.getByRole("link", { name: /More Info about UW CLUE Program/ });
        expect(link).toHaveAttribute("href", "https://academicsupport.uw.edu/clue/");
        expect(link).toHaveAttribute("target", "_blank");
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
        expect(within(club).getByText("RSO · Community")).toBeInTheDocument();
        expect(within(club).getByText("A club still writing its description.")).toBeInTheDocument();
        expect(within(club).getByText("Details coming soon")).toBeInTheDocument();
        expect(within(club).queryByRole("link")).not.toBeInTheDocument();
    });

    test("narrows results with tag filters and clears them", () => {
        renderResourcesPage();

        fireEvent.click(screen.getByRole("checkbox", { name: /^Career/ }));
        expect(resultCards()).toHaveLength(1);
        expect(screen.getByText("1 resource · Career")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
        expect(resultCards()).toHaveLength(3);
    });

    test("searches by keyword and highlights the match", () => {
        renderResourcesPage();

        fireEvent.change(screen.getByRole("combobox", { name: "Search" }), { target: { value: "tutoring" } });

        expect(resultCards()).toHaveLength(1);
        const card = screen.getByRole("article");
        expect(within(card).getByText("tutoring", { selector: "mark" })).toBeInTheDocument();
    });

    test("opens filtered to the category named in an older link", () => {
        renderResourcesPage(resources, `/resources?category=${resourceTags.ACADEMIC}`);

        expect(screen.getByRole("checkbox", { name: /^Academic/ })).toBeChecked();
        expect(resultCards()).toHaveLength(1);
    });

    test("explains when a filter has no resources yet", () => {
        renderResourcesPage();

        fireEvent.click(screen.getByRole("checkbox", { name: /^SWE/ }));

        expect(screen.getByRole("heading", { name: "No resources match those filters." })).toBeInTheDocument();
    });

    test("pages through resources 15 at a time", () => {
        renderResourcesPage(manyResources);

        expect(resultCards()).toHaveLength(15);
        const pages = screen.getByRole("navigation", { name: "Resource pages" });
        expect(pages).toHaveTextContent("Page 1 of 2");
        expect(within(pages).getByRole("button", { name: /Previous/ })).toBeDisabled();

        fireEvent.click(within(pages).getByRole("button", { name: /Next/ }));

        expect(resultCards()).toHaveLength(7);
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

        renderResourcesPage(manyResources);

        expect(resultCards()).toHaveLength(cardsPerPage);
    });

    test("hides the page controls when everything fits on one page", () => {
        renderResourcesPage();

        expect(screen.queryByRole("navigation", { name: "Resource pages" })).not.toBeInTheDocument();
    });
});
