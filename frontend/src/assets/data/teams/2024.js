import { groupType } from "../Enum";
import { officerPositions } from "../Enum";
import { webDevPositions, creativeCommitteePositions, diversityCommitteePositions } from "../Enum";

// Lower the resolution of the image if the picture looks grainy
// https://adobe.com/express/feature/image/resize
// https://stackoverflow.com/questions/74502978/object-fit-cover-gives-pixelated-images-on-chrome

/* 2024 officers images */
import _2024_sheamin from "../officerPhotos/2024/officer_sheamin.jpg";
import _2024_akash from "../officerPhotos/2024/officer_akash.png";
import _2024_jr from "../officerPhotos/2024/officer_jr.jpg";
import _2024_shirley from "../officerPhotos/2024/officer_shirley.png";
import _2024_jada from "../officerPhotos/2024/officer_jada.png";
import _2024_bright from "../officerPhotos/2024/officer_bright.png";
import _2024_jonathan from "../officerPhotos/2024/officer_jonathan_.jpg";
import _2024_michaela from "../officerPhotos/2024/officer_michaela.jpeg";
import _2024_iris from "../officerPhotos/2024/officer_iris.png";

export const team2024 = {
        2024: {
        [groupType.OFFICERS]: [
            {
                position: officerPositions.PRESIDENT,
                name: "Sheamin Kim",
                picture: _2024_sheamin,
                socials: {
                    linkedin: "https://www.linkedin.com/in/sheamink/", 
                }
            },
            {
                position: officerPositions.VICE_PRESIDENT,
                name: "Akash Shrestha",
                picture: _2024_akash,
                socials: {
                    linkedin: "https://www.linkedin.com/in/akashkshrestha/",
                }
            },
            {
                position: officerPositions.FINANCE,
                name: "J.R. Lim",
                picture: _2024_jr,
                socials: {
                    linkedin: "https://www.linkedin.com/in/jr-lim/",
                }
            },
            {
                position: officerPositions.CREATIVE,
                name: "Shirley Yun",
                picture: _2024_shirley,
                socials: {
                    linkedin: "https://www.linkedin.com/in/shirleyyun/",
                }
            },
            {
                position: officerPositions.PUBLIC_RELATIONS,
                name: "Jada Nguyen",
                picture: _2024_jada,
                socials: {
                    linkedin: "https://www.linkedin.com/in/jadanguyend/",
                }
            },
            {
                position: officerPositions.OUTREACH,
                name: "Bright Hoang",
                picture: _2024_bright,
                socials: {
                    linkedin: "https://www.linkedin.com/in/brighth/",
                }
            },
            {
                position: officerPositions.DIVERSITY,
                name: "Jonathan Ortiz-Candelaria",
                picture: _2024_jonathan,
                socials: {
                    linkedin: "https://www.linkedin.com/in/jonathan-hugh-ortiz-candelaria/",
                }
            },
            {
                position: officerPositions.IT,
                name: "Michaela Tran",
                picture: _2024_michaela,
                socials: {
                    linkedin: "www.linkedin.com/in/michaela-tran",
                }
            },
            {
                position: officerPositions.ACADEMIC,
                name: "Iris Hamilton",
                picture: _2024_iris,
                socials: {
                    linkedin: "https://www.linkedin.com/in/iris-ham/",
                }
            },
        ],
        [groupType.WEB_COMMITTEE]: [],
        [groupType.CREATIVE_COMMITTEE]: [],
        [groupType.FYR]: [],
    },
}