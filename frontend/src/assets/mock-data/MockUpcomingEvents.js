import { addDays, set } from "date-fns";
import bowling from "../gallery/bowling.jpeg";
import gamenight from "../gallery/gamenight.jpg";
import groups from "../gallery/groups.jpg";
import officers from "../gallery/officers-22.png";
import panelists from "../gallery/panelists.jpg";

// Events for local development only. The first two mirror the real events in
// backend/publishedEvents.js, which is what the live site shows; change them
// there first. The rest are made-up samples, dated relative to today so the
// calendar always has something upcoming.
const startingIn = (days, hours, minutes) =>
    set(addDays(new Date(), days), { hours, minutes, seconds: 0, milliseconds: 0 }).toISOString();

const DIETARY_QUESTION = { qId: "mock-dietary", qString: "Any dietary restrictions?" };

export const mockUpcomingEvents = [
    {
        eId: "mock-problem-workshop",
        eName: "What problem are you actually solving?",
        eStartDate: new Date(2026, 9, 14, 13, 30).toISOString(),
        eLocation: "iStartup Lab, MGH 310",
        eOrganizers: "iStartup Lab",
        eDescription: "The iStartup Lab is hosting Samir Mehta (6x founder) for a workshop on checking your idea before you spend months building it. You'll get a quick intro to the entrepreneurial lifecycle, then work through who actually has the problem you're excited about and what would prove it's real. Samir will give feedback and take questions at the end. Bring a rough idea, or just come curious.",
        eLabels: ["Career"],
        eThumbnailPath: "/assets/events/istartup-problem-workshop.webp",
        rsvpEnabled: false,
        showParticipants: false,
        rsvpQuestions: [],
    },
    {
        eId: "mock-accenture-networking",
        eName: "Networking with Accenture",
        eStartDate: new Date(2026, 9, 26, 17, 30).toISOString(),
        eEndDate: new Date(2026, 9, 26, 18, 30).toISOString(),
        eLocation: "HUB 334",
        eOrganizers: "IUGA",
        eDescription: "Want to break into tech and consulting? Join us for an exclusive panel event with Accenture! Get the inside scoop from current Accenture professionals working across a variety of tech backgrounds. Whether you want to know about the day-to-day work culture or need tips to ace the recruitment process, this is your chance to learn from the best.",
        eLabels: ["Career"],
        eThumbnailPath: "/assets/events/accenture-networking.webp",
        rsvpEnabled: false,
        eAltLink: {
            title: "RSVP and submit your questions",
            url: "https://forms.cloud.microsoft/pages/responsepage.aspx?id=W9229i_wGkSZoBYqxQYL0pj2PffrcZlMvNzx2DvLiVNUMDVST05QVTFBRDI0VUdIVEhUSEg1Q1FIUS4u&route=shorturl",
        },
        showParticipants: false,
        rsvpQuestions: [],
    },
    {
        eId: "mock-game-night",
        eName: "IUGA Game Night",
        eStartDate: startingIn(1, 17, 30),
        eLocation: "MGH 120",
        eOrganizers: "IUGA",
        eDescription: "Board games, card games, and snacks. Come on your own or bring a friend, and stay for as long as you like.",
        eLabels: ["Social"],
        eThumbnailPath: gamenight,
        rsvpEnabled: true,
        showParticipants: false,
        rsvpQuestions: [DIETARY_QUESTION],
    },
    {
        eId: "mock-study-jam",
        eName: "Study Jam",
        eStartDate: startingIn(2, 12, 30),
        eLocation: "MGH 122",
        eOrganizers: "IUGA",
        eDescription: "A quiet room and other Informatics students to work alongside. Bring whatever you are working on this week.",
        eLabels: ["Academic"],
        eThumbnailPath: groups,
        rsvpEnabled: true,
        showParticipants: false,
        rsvpQuestions: [],
    },
    {
        eId: "mock-industry-panel",
        eName: "Industry Panel + Networking",
        eStartDate: startingIn(2, 18, 0),
        eLocation: "HUB 332",
        eOrganizers: "IUGA",
        eDescription: "Panelists talk about how they got started and what their work looks like now, followed by open time to meet them.",
        eLabels: ["Career"],
        eThumbnailPath: panelists,
        rsvpEnabled: true,
        showParticipants: false,
        rsvpQuestions: [{ qId: "mock-panel-question", qString: "Any questions for the panelists?" }],
    },
    {
        eId: "mock-meet-greet",
        eName: "Officer Meet & Greet",
        eStartDate: startingIn(7, 16, 0),
        eLocation: "MGH 120",
        eOrganizers: "IUGA",
        eDescription: "Meet this year's officers, hear what each committee is working on, and tell them what you want from IUGA.",
        eLabels: ["Social", "Academic"],
        eThumbnailPath: officers,
        rsvpEnabled: true,
        showParticipants: false,
        rsvpQuestions: [],
    },
    {
        eId: "mock-bowling",
        eName: "Bowling at UW",
        eStartDate: startingIn(10, 18, 30),
        eLocation: "HUB Games",
        eOrganizers: "IUGA and Winfo",
        eDescription: "An evening of bowling with students from both organizations. Lanes and shoes are reserved for the group.",
        eLabels: ["Social"],
        eThumbnailPath: bowling,
        rsvpEnabled: true,
        showParticipants: false,
        rsvpQuestions: [DIETARY_QUESTION],
    },
];
