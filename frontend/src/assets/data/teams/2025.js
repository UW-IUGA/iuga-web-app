import { groupType } from "../Enum";
import { officerPositions } from "../Enum";
// import { creativeCommitteePositions, diversityCommitteePositions, itCommitteePositions } from "../Enum";

// Lower the resolution of the image if the picture looks grainy
// https://adobe.com/express/feature/image/resize
// https://stackoverflow.com/questions/74502978/object-fit-cover-gives-pixelated-images-on-chrome

/* 2025 officers images */
import _2025_bright from "../officerPhotos/2025/bright.jpg";
import _2025_abraham from "../officerPhotos/2025/abe.jpg";
import _2025_george from "../officerPhotos/2025/george.png";
import _2025_asmi from "../officerPhotos/2025/asmi.png";
import _2025_izzy from "../officerPhotos/2025/izzy.png";
import _2025_akshat from "../officerPhotos/2024/akshat";
import _2025_preeti from "../officerPhotos/2025/preeti.png";
import _2025_nhu from "../officerPhotos/2025/nhu.jpeg";
import _2025_camilo from "../officerPhotos/2025/camilo.jpeg";


export const team_2025 = {
        //2025: {
        [groupType.OFFICERS]: [
            {
                position: officerPositions.PRESIDENT,
                name: "Bright Hoang",
                picture: _2025_bright,
                socials: {
                    linkedin: "https://www.linkedin.com/in/brighth/", 
                }
            },
            {
                position: officerPositions.VICE_PRESIDENT,
                name: "Abraham Gibson",
                picture: _2025_abraham,
                socials: {
                    linkedin: "https://www.linkedin.com/in/abrahamgib/",
                }
            },
            {
                position: officerPositions.FINANCE,
                name: "George Lee",
                picture: _2025_george,
                socials: {
                    linkedin: "https://www.linkedin.com/in/george-y-lee/",
                }
            },
            {
                position: officerPositions.CREATIVE,
                name: "Asmi Sathaye",
                picture: _2025_asmi,
                socials: {
                    linkedin: "https://www.linkedin.com/in/asmi-sathaye-269b05335/",
                }
            },
            {
                position: officerPositions.PUBLIC_RELATIONS,
                name: "Izzy Saccone",
                picture: _2025_izzy,
                socials: {
                    linkedin: "https://www.linkedin.com/in/isabel-saccone-645998250/",
                }
            },
            {
                position: officerPositions.OUTREACH,
                name: "Preeti Kotipalli",
                picture: _2025_preeti,
                socials: {
                    linkedin: "https://www.linkedin.com/in/preeti-kotipalli/",
                }
            },
            {
                position: officerPositions.DIVERSITY,
                name: "Nhu Tat",
                picture: _2025_nhu,
                socials: {
                    linkedin: "https://www.linkedin.com/in/nhutat/",
                }
            },
            {
                position: officerPositions.IT,
                name: "Camilo Montes de Haro",
                picture: _2025_camilo,
                socials: {
                    linkedin: "https://www.linkedin.com/in/camilomontesdeharo/",
                }
            },
            {
                position: officerPositions.ACADEMIC,
                name: "Akshat Ghuge",
                picture: _2024_akshat,
                socials: {
                    linkedin: "https://www.linkedin.com/in/akshat-ghuge/",
                }
            },
        ]
        /*
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
            {
                position: creativeCommitteePositions.MEMBER,
                name: "Candra Kou",
                picture: _2024_candra,
                socials: {
                    linkedin: "https://www.linkedin.com/in/candra-kou-0a413020a/?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=ios_app",
                }
            },
            {
                position: creativeCommitteePositions.MEMBER,
                name: "Elizabeth Skalatsky",
                picture: _2024_elizabeth,
                socials: {
                    website: "https://ux-evs.framer.ai/",
                    linkedin: "https://www.linkedin.com/in/elizabeth-s-19211b261/",
                }
            },
            {
                position: creativeCommitteePositions.MEMBER,
                name: "Joy Li",
                picture: _2024_joy,
                socials: {
                    website: "https://joyli.framer.website/",
                    linkedin: "https://www.linkedin.com/in/joy-y-li/",
                }
            },
            {
                position: creativeCommitteePositions.MEMBER,
                name: "Steven Heng",
                picture: _2024_steven,
                socials: {
                    website: "https://www.steven-heng.com/",
                    linkedin: "https://www.linkedin.com/in/steven-w-heng/",
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
            {
                position: itCommitteePositions.MEMBER,
                name: "Aidan Barlett",
                picture: _2024_aidan,
                socials: {
                    website: "https://aidanbartlett0.github.io/portfolio/",
                    linkedin: "https://www.linkedin.com/in/aidanbartlett/",
                }
            },
            {
                position: itCommitteePositions.MEMBER,
                name: "Camilo Montes",
                picture: _2024_camilo,
                socials: {
                    linkedin: "https://www.linkedin.com/in/camilomontesdeharo/",
                }
            },
            {
                position: itCommitteePositions.MEMBER,
                name: "Carolyn Chen",
                picture: _2024_carolyn,
                socials: {
                    linkedin: "https://www.linkedin.com/in/carolynchristopherchen/",
                }
            },
            {
                position: itCommitteePositions.MEMBER,
                name: "Jasmine Vuong",
                picture: _2024_jasmine,
                socials: {
                    linkedin: "https://www.linkedin.com/in/jasmine-vuong/",
                }
            },
            {
                position: itCommitteePositions.MEMBER,
                name: "Vera Guber",
                picture: _2024_vera,
                socials: {
                    website: "https://www.veraguber.com/",
                    linkedin: "https://www.linkedin.com/in/vera-guber-527851229/",
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
            {
                position: diversityCommitteePositions.MEMBER,
                name: "Aarya Bhoite",
                picture: _2024_aarya,
                socials: {
                    linkedin: "https://www.linkedin.com/in/aarya-bhoite-6340362b9/",
                }
            },
            {
                position: diversityCommitteePositions.MEMBER,
                name: "Carlos Carrillo-Sandoval",
                picture: _2024_carlos,
                socials: {
                    website: "https://carlos-carrillo.com/",
                    linkedin: "https://www.linkedin.com/in/cacs27/",
                }
            },
            {
                position: diversityCommitteePositions.MEMBER,
                name: "Diana Almanza",
                picture: _2024_diana,
                socials: {
                    linkedin: "https://www.linkedin.com/in/diana-almanza-79bb67232/",
                }
            },
            {
                position: diversityCommitteePositions.MEMBER,
                name: "Lyrisse Faith Samson",
                picture: _2024_faith,
                socials: {
                    linkedin: "https://www.linkedin.com/in/lyrisse-faith-samson/",
                }
            },
        ],
    // },
    */
}