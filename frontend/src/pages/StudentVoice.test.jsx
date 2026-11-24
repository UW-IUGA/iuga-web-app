import { render, screen } from "@testing-library/react";
import { resetPageEntranceForTests } from "../utils/pageEntrance";
import StudentVoicePage from "./StudentVoice";

const forms = [
    { title: "First survey", description: "One", href: "https://example.com/a", topic: "Campus" },
    { title: "Second survey", description: "Two", href: "https://example.com/b", topic: "Classes" },
];

beforeEach(() => {
    resetPageEntranceForTests();
    window.innerWidth = 1440;
});

test("waves the survey cards in on the first visit, and not again in the same session", () => {
    const first = render(<StudentVoicePage forms={forms} />);
    const main = document.querySelector("main.studentVoice");
    const cards = [...document.querySelectorAll("article.studentVoiceCard")];

    expect(main).toHaveClass("pageEntrance--enter");
    expect(screen.getByRole("heading", { name: "Tell IUGA what you think." })).not.toHaveClass("pageEntrance__item");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveClass("pageEntrance__item");
    expect(cards[0].style.getPropertyValue("--entrance-i")).toBe("0");
    expect(cards[1].style.getPropertyValue("--entrance-i")).toBe("1");
    first.unmount();

    render(<StudentVoicePage forms={forms} />);
    expect(document.querySelector("main.studentVoice")).not.toHaveClass("pageEntrance--enter");
});
