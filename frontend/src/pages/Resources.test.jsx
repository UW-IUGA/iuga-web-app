import { fireEvent, render, screen } from "@testing-library/react";
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
        rName: "iSchool Career Services",
        rDescription: "Career advising and job search support.",
        rLink: "https://ischool.uw.edu/career",
        rImage: null,
    },
];

beforeEach(() => {
    window.scrollTo = vi.fn();
});

function renderResourcesPage() {
    return render(
        <MemoryRouter>
            <ResourcesPage resources={resources} />
        </MemoryRouter>
    );
}

describe("ResourcesPage", () => {
    test("keeps categories compact until their accordion is opened", () => {
        renderResourcesPage();

        expect(screen.getByRole("heading", { name: "Resources" })).toBeInTheDocument();
        const academicCategory = screen.getByRole("button", { name: `Show ${resourceTags.ACADEMIC}` });
        expect(academicCategory).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByRole("link", { name: /Visit resource/ })).not.toBeInTheDocument();

        fireEvent.click(academicCategory);
        expect(screen.getByRole("button", { name: `Hide ${resourceTags.ACADEMIC}` })).toHaveAttribute("aria-expanded", "true");

        const link = screen.getAllByRole("link", { name: /Visit resource/ })
            .find((resourceLink) => resourceLink.getAttribute("href") === "https://academicsupport.uw.edu/clue/");
        expect(link).toHaveAttribute("href", "https://academicsupport.uw.edu/clue/");
        expect(link).toHaveAttribute("target", "_blank");
    });

    test("expands matching categories for category filters and keyword searches", () => {
        renderResourcesPage();

        fireEvent.click(screen.getByRole("button", { name: resourceTags.CAREER }));
        expect(screen.getByRole("button", { name: `Hide ${resourceTags.CAREER}` })).toHaveAttribute("aria-expanded", "true");
        expect(screen.queryByRole("button", { name: `Show ${resourceTags.ACADEMIC}` })).not.toBeInTheDocument();

        fireEvent.change(screen.getByRole("searchbox", { name: "Search resources" }), {
            target: { value: "advising" },
        });
        expect(screen.getByText("1 resource found")).toBeInTheDocument();
        expect(screen.getByText("1 match")).toBeInTheDocument();
        expect(screen.getByText("iSchool Career Services")).toBeInTheDocument();
    });

    test("allows filtered categories to be collapsed and reopened", () => {
        renderResourcesPage();

        fireEvent.click(screen.getByRole("button", { name: resourceTags.ACADEMIC }));

        const academicSection = document.getElementById("resource-academic");
        const hideButton = screen.getByRole("button", { name: `Hide ${resourceTags.ACADEMIC}` });
        expect(academicSection).toHaveAttribute("id", "resource-academic");
        expect(hideButton).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByText("UW CLUE Program")).toBeInTheDocument();

        fireEvent.click(hideButton);
        expect(screen.getByRole("button", { name: `Show ${resourceTags.ACADEMIC}` })).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByText("UW CLUE Program")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: `Show ${resourceTags.ACADEMIC}` }));
        expect(screen.getByText("UW CLUE Program")).toBeInTheDocument();
    });
});
