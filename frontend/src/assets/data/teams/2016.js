import { groupType } from "../Enum";
import { officerPositions } from "../Enum";
import { webDevPositions, creativeCommitteePositions, diversityCommitteePositions } from "../Enum";


/* 2016 officer images */
import _2016_belltowne from "../officerPhotos/2016/alexander-bell-towne.jpg";
import _2016_leeds from "../officerPhotos/2016/benjamin-leeds.jpg";
import _2016_holland from "../officerPhotos/2016/brad-holland.jpg";
import _2016_han from "../officerPhotos/2016/jenna-han.jpg";
import _2016_li from "../officerPhotos/2016/jonathan-li.jpg";
import _2016_dietzler from "../officerPhotos/2016/natasha-dietzler.jpg";
import _2016_le from "../officerPhotos/2016/royce-le.jpg";
import _2016_patel from "../officerPhotos/2016/rutvi-patel.jpg";

export const team_2016 = {
    [groupType.OFFICERS]: [
        {
            position: officerPositions.PRESIDENT,
            name: "Jonathan Li",
            picture: _2016_li,
            socials: {
                linkedin: "https://www.linkedin.com/in/jonathanpli",
                github: "https://github.com/jonathanpli",
            }
        },
        {
            position: officerPositions.VICE_PRESIDENT,
            name: "Rutvi Patel",
            picture: _2016_patel,
            socials: {
                linkedin: "https://www.linkedin.com/in/rutvimpatel",
                github: "https://github.com/rutvimpatel",
            }
        },
        {
            position: officerPositions.FINANCE,
            name: "Benjamin Leeds",
            picture: _2016_leeds,
            socials: {
                linkedin: "https://www.linkedin.com/in/benjaminleeds",
            }
        },
        {
            position: officerPositions.CREATIVE,
            name: "Jenna Han",
            picture: _2016_han,
            socials: {
                linkedin: "https://www.linkedin.com/in/jennahan",
            }
        },
        {
            position: officerPositions.PUBLIC_RELATIONS,
            name: "Brad Holland",
            picture: _2016_holland,
            socials: {
                linkedin: "https://www.linkedin.com/in/bradleyrholland",
            }
        },
        {
            position: officerPositions.OUTREACH,
            name: "Natasha Dietzler",
            picture: _2016_dietzler,
            socials: {
                linkedin: "https://www.linkedin.com/in/ndietzler",
            }
        },
        {
            position: officerPositions.IT,
            name: "Alexander Bell-Towne",
            picture: _2016_belltowne,
            socials: {
                linkedin: "https://www.linkedin.com/in/alexbbt",
                github: "https://github.com/alexbbt",
            }
        },
        {
            position: officerPositions.DIVERSITY,
            name: "Royce Le",
            picture: _2016_le,
            socials: {
                linkedin: "https://www.linkedin.com/in/roycevanle",
            }
        },
    ],
}