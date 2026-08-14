import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import GetInvolvedMemberCard from "./GetInvolvedMemberCard";

const makeMember = (overrides = {}) => ({
    name: "Bright Hoang",
    position: "President",
    picture: "bright.jpg",
    socials: { linkedin: "https://www.linkedin.com/in/brighth/" },
    ...overrides,
});

describe("GetInvolvedMemberCard", () => {
    test("renders the member photo with name-based alt text", () => {
        render(<GetInvolvedMemberCard member={makeMember({ name: "Izzy Saccone", picture: "izzy.jpg" })} />);
        expect(screen.getByRole("img", { name: "Izzy Saccone" })).toHaveAttribute("src", "izzy.jpg");
    });

    test("renders the name and position", () => {
        render(<GetInvolvedMemberCard member={makeMember()} />);
        expect(screen.getByRole("heading", { level: 3, name: "Bright Hoang" })).toBeInTheDocument();
        expect(screen.getByText("President")).toBeInTheDocument();
    });

    test("renders a placeholder instead of a broken image", () => {
        render(<GetInvolvedMemberCard member={makeMember({ name: "Ellie Marsh", picture: null, socials: null })} />);
        expect(screen.queryByRole("img")).not.toBeInTheDocument();
        expect(screen.getByLabelText("Ellie Marsh photo unavailable")).toBeInTheDocument();
    });

    test("renders only the provided social links", () => {
        render(<GetInvolvedMemberCard member={makeMember()} />);
        expect(screen.getByRole("link", { name: "Bright Hoang LinkedIn" })).toHaveAttribute(
            "href",
            "https://www.linkedin.com/in/brighth/"
        );
        expect(screen.getAllByRole("link")).toHaveLength(1);
    });

    test("renders no social links or committee CTA when socials are missing", () => {
        render(<GetInvolvedMemberCard member={makeMember({ socials: null })} />);
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /join .* committee/i })).not.toBeInTheDocument();
    });

});
