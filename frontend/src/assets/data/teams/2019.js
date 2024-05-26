import { groupType } from "../Enum";
import { officerPositions } from "../Enum";

/* 2019 officer images */
import _2019_alejandro from "../officerPhotos/2019/alejandro.jpg";
import _2019_william from "../officerPhotos/2019/williamkwok.jpg";
import _2019_casey from "../officerPhotos/2019/caseytran.jpg";
import _2019_james from "../officerPhotos/2019/james.jpg";
import _2019_shruti from "../officerPhotos/2019/shrutir.jpg";
import _2019_allison from "../officerPhotos/2019/allison_lee.jpg";
import _2019_dayoung from "../officerPhotos/2019/dayoung.jpg";
import _2019_kiran from "../officerPhotos/2019/kiran.jpg";

export const team_2019 = {
    [groupType.OFFICERS]: [
        {
            position: officerPositions.PRESIDENT,
            name: "Alejandro Huante",
            picture: _2019_alejandro,
            socials: {
                github: "https://github.com/ahuante-1741170",
                linkedin: "https://www.linkedin.com/in/alejandro-huante-28533a141/",
            }
        },
        {
            position: officerPositions.VICE_PRESIDENT,
            name: "James Kim",
            picture: _2019_james,
            socials: {
                github: "https://github.com/thejameskim",
                linkedin: "https://www.linkedin.com/in/thejameskim/",
            }
        },
        {
            position: officerPositions.FINANCE,
            name: "Kiran Pradhan",
            picture: _2019_kiran,
            socials: {
                github: "https://github.com/kiranpradhan01",
                linkedin: "https://www.linkedin.com/in/kiran-pradhan-aa8861162/",
            }
        },
        {
            position: officerPositions.CREATIVE,
            name: "Casey Tran",
            picture: _2019_casey,
            socials: {
                linkedin: "https://www.linkedin.com/in/caseytran/",
            }
        },
        {
            position: officerPositions.PUBLIC_RELATIONS,
            name: "Allison Lee",
            picture: _2019_allison,
            socials: {
                github: "https://github.com/alliL",
                linkedin: "https://www.linkedin.com/in/allison20/",
            }
        },
        {
            position: officerPositions.OUTREACH,
            name: "Dayoung Cheong",
            picture: _2019_dayoung,
            socials: {
                github: "https://github.com/dayoungcheong",
                linkedin: "https://www.linkedin.com/in/dayoungcheong/",
            }
        },
        {
            position: officerPositions.IT,
            name: "William Kwok",
            picture: _2019_william,
            socials: {
                github: "https://github.com/kwokwilliam",
                linkedin: "https://www.linkedin.com/in/william-w-kwok/",
                website: "https://williamk.info",
            }
        },
        {
            position: officerPositions.ACADEMIC,
            name: "Shruti Rajagopalan",
            picture: _2019_shruti,
            socials: {
                github: "https://github.com/ShrutiR5",
                linkedin: "https://www.linkedin.com/in/shrutira/",
            }
        },
    ]
}