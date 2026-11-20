import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import PageHeader from "./PageHeader";

describe("PageHeader", () => {
    test("names the page with its only main heading", () => {
        render(<PageHeader label="Resources" title="Find support across the iSchool." intro="Support in one place." />);

        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(screen.getByRole("region", { name: "Find support across the iSchool." })).toBeInTheDocument();
        expect(screen.getByText("Resources")).toBeInTheDocument();
        expect(screen.getByText("Support in one place.")).toBeInTheDocument();
    });

    test("shows page actions and a visual when a page provides them", () => {
        render(
            <PageHeader label="Events" title="Find what's happening this week." visual={<img alt="Students at an event" />}>
                <a href="/events">Explore events</a>
            </PageHeader>
        );

        expect(screen.getByRole("link", { name: "Explore events" })).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Students at an event" })).toBeInTheDocument();
    });

    test("leaves out the label line when a page has no label", () => {
        const { container } = render(<PageHeader title="Make the most of the iSchool." />);

        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Make the most of the iSchool.");
        expect(container.querySelector(".pageHeader__label")).not.toBeInTheDocument();
    });
});
