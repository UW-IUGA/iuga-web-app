import { render, screen } from "@testing-library/react";
import { groupType } from "../assets/data/Enum";
import { resetPageEntranceForTests } from "../utils/pageEntrance";
import AboutPage from "./About";

const teams = {
    2026: {
        [groupType.OFFICERS]: [
            { name: "Ada", position: "President" },
            { name: "Ben", position: "Vice President" },
            { name: "Cia", position: "Director of Finance" },
            { name: "Drew", position: "Director of IT" },
        ],
    },
};

beforeEach(() => {
    resetPageEntranceForTests();
    window.innerWidth = 1440;
});

test("waves the officer cards in on the first visit, leaving the title still", () => {
    render(<AboutPage teams={teams} />);

    expect(document.querySelector("main.about")).toHaveClass("pageEntrance--enter");
    expect(screen.getByRole("heading", { name: "Meet the students behind IUGA." })).not.toHaveClass("pageEntrance__item");

    const cards = [...document.querySelectorAll("article.studentProfileCard")];
    expect(cards).toHaveLength(4);
    expect(cards[0]).toHaveClass("pageEntrance__item");
    expect(cards[0].style.getPropertyValue("--entrance-row")).toBe("0");
    expect(cards[0].style.getPropertyValue("--entrance-i")).toBe("0");
    expect(cards[3].style.getPropertyValue("--entrance-row")).toBe("1");
    expect(cards[3].style.getPropertyValue("--entrance-i")).toBe("0");
});
