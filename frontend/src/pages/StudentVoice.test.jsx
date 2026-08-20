import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import StudentVoicePage from "./StudentVoice";

const activeForms = [
    {
        title: "Spring events feedback",
        description: "Tell IUGA which events and formats would best support your quarter.",
        href: "https://forms.example.edu/spring-events",
        topic: "Events",
        closesOn: "Closes Friday",
    },
];

describe("StudentVoicePage", () => {
    test("shows an honest empty state when no surveys are open", () => {
        render(<StudentVoicePage forms={[]} />);

        expect(screen.getByRole("heading", { level: 1, name: "Student Voice" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "No surveys are open right now." })).toBeInTheDocument();
    });

    test("presents active forms as external feedback links", () => {
        render(<StudentVoicePage forms={activeForms} />);

        expect(screen.getByRole("heading", { name: "Spring events feedback" })).toBeInTheDocument();
        expect(screen.getByText("Events")).toBeInTheDocument();
        expect(screen.getByText("Closes Friday")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Share your feedback: Spring events feedback" })).toHaveAttribute(
            "href",
            "https://forms.example.edu/spring-events"
        );
        expect(screen.getByRole("link", { name: "Share your feedback: Spring events feedback" })).toHaveAttribute(
            "target",
            "_blank"
        );
    });
});
