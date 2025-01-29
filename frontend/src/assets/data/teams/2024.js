import { groupType, itCommitteePositions } from "../Enum";
import { officerPositions } from "../Enum";
import { webDevPositions, creativeCommitteePositions, diversityCommitteePositions } from "../Enum";

// Lower the resolution of the image if the picture looks grainy
// https://adobe.com/express/feature/image/resize
// https://stackoverflow.com/questions/74502978/object-fit-cover-gives-pixelated-images-on-chrome

// test

/* 2024 officers images */
import _2024_sheamin from "../officerPhotos/2024/officer_sheamin.jpg";
import _2024_akash from "../officerPhotos/2024/akash_2024_profile.png";
import _2024_jr from "../officerPhotos/2024/officer_jr.jpg";
import _2024_shirley from "../officerPhotos/2024/officer_shirley.png";
import _2024_jada from "../officerPhotos/2024/jada_2024_profile.png";
import _2024_bright from "../officerPhotos/2024/officer_bright.png";
import _2024_jonathan from "../officerPhotos/2024/officer_jonathan.jpg";
import _2024_michaela from "../officerPhotos/2024/officer_michaela.jpeg";
import _2024_iris from "../officerPhotos/2024/officer_iris.png";
import _2024_akshat from "../officerPhotos/2024/officer_akshat.jpeg";
import _2024_abraham from "../officerPhotos/2024/officer_abraham.jpeg";
import _2024_george from "../officerPhotos/2024/officer_george.jpg";
import _2024_preeti from "../officerPhotos/2024/officer_preeti.jpg";


export const team_2024 = {
        //2024: {
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
                    linkedin: "https://www.linkedin.com/in/michaela-tran",
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
        [groupType.FYR]: [
            {
            position: officerPositions.FYR,
            name: "Akshat Ghuge",
            picture: _2024_akshat,
            socials: {
                linkedin: "https://www.linkedin.com/in/akshat-ghuge/",
            }
            }, 
            {
                position: officerPositions.FYR,
                name: "Preeti Kotipalli",
                picture: _2024_preeti,
                socials: {
                    linkedin: "https://www.linkedin.com/in/preeti-kotipalli/",
                }
            },
            {
                position: officerPositions.FYR,
                name: "George Lee",
                picture: _2024_george,
                socials: {
                    linkedin: "https://www.linkedin.com/in/george-y-lee/",
                }
            },
            {
                position: officerPositions.FYR,
                name: "Abraham Gibson",
                picture: _2024_abraham,
                socials: {
                    linkedin: "https://www.linkedin.com/in/abrahamgib/",
                }
            },
        ],
        [groupType.CREATIVE_COMMITTEE]: [
            {
                position: creativeCommitteePositions.LEAD,
                name: "Shirley Yun",
                picture: _2024_shirley,
                socials: {
                    linkedin: "https://www.linkedin.com/in/shirleyyun/",
                }
            },
        ],
        [groupType.IT_COMMITTEE]: [
            {
                position: itCommitteePositions.LEAD,
                name: "Michaela Tran",
                picture: _2024_michaela,
                socials: {
                    linkedin: "https://www.linkedin.com/in/michaela-tran",
                }
            },
        ],
        [groupType.DIVERSITY_COMMITTEE]: [
            {
                position: diversityCommitteePositions.LEAD,
                name: "Jonathan Ortiz-Candelaria",
                picture: _2024_jonathan,
                socials: {
                    linkedin: "https://www.linkedin.com/in/jonathan-hugh-ortiz-candelaria/",
                }
            },
        ],
    // },
}