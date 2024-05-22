import { aboutTags } from "./Enum";
import { groupType } from "./Enum";
import { officerPositions } from "./Enum";

export const mockMembers = {
    members: {
        2024: {
            [groupType.BOARD_MEMBERS]: [
                {
                    position: officerPositions.COPRESIDENT,
                    name: "Sirena Akopyans",
                    picture: "",
                    linkedin: "https://www.linkedin.com/in/sirena-akopyan/",
                },
                {
                    position: officerPositions.COPRESIDENT,
                    name: "Phyllis Chen",
                    picture: "",
                    linkedin: "https://www.linkedin.com/in/phyllis-chen-profile/",
                },
            ],
            [groupType.WEB_COMMITTEE]: [
                {
                    name: "",
                },
            ],
            [groupType.CREATIVE_COMMITTEE]: [
                {
                    name: "",
                },
            ],
        },
        2023: {
            // ...
        },
    },
    rsos: [
        {
            rName: "Informatics Undergraduate Association",
            rDescription:
                "IUGA is a student-led RSO that communicates between the Informatics student body, faculty, and administration of the University of Washington Information School. We host fun, community building events as well as events for professional development.",
            tag: aboutTags.RSO,
        },
        {
            rName: "Informatics Undergraduate Association",
            rDescription:
                "IUGA is a student-led RSO that communicates between the Informatics student body, faculty, and administration of the University of Washington Information School. We host fun, community building events as well as events for professional development.",
            tag: aboutTags.RSO,
        },
    ],
};
