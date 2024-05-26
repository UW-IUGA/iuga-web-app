import { groupType } from "../Enum";
import { officerPositions } from "../Enum";
import { webDevPositions, creativeCommitteePositions, diversityCommitteePositions } from "../Enum";

/*2023 officers images*/
import _2023_phyllis from "../officerPhotos/2022/phyllischen.jpg";
import _2023_sirena from "../officerPhotos/2022/sirenaakopyan.jpg";
import _2023_suraj from "../officerPhotos/2023/SurajShankarGangaramimage.png";
import _2023_mariko from "../officerPhotos/2023/MarikoWoodworthimage.jpg";
import _2023_shea from "../officerPhotos/2023/SheaminKimimage.jpg";
import _2023_brandon from "../officerPhotos/2023/BrandonMendozaimage.jpg";
import _2023_ryan from "../officerPhotos/2023/RyanLouieimage.jpg";
import _2023_eric from "../officerPhotos/2023/eric.jpg";
import _2023_bhavya from "../officerPhotos/2023/bhavya.jpg";
import _2023_harold from "../officerPhotos/2023/harold_23.jpg";
import _2023_vera from "../officerPhotos/2023/vera_23.jpeg";
import _2023_shea2 from "../officerPhotos/2023/sheamin_24.jpg";
import _2023_jada from "../officerPhotos/2024/jada_2024_profile.png";
import _2023_shirley from "../officerPhotos/2024/shirley_2024_profile.png";



export const team_2023 = {
    [groupType.OFFICERS]: [
        {
            position: officerPositions.COPRESIDENT,
            name: "Sirena Akopyans",
            picture: _2023_sirena,
            socials: {
                linkedin: "https://www.linkedin.com/in/sirena-akopyan/",
            }
        },
        {
            position: officerPositions.COPRESIDENT,
            name: "Phyllis Chen",
            picture: _2023_phyllis,
            socials: {
                linkedin: "https://www.linkedin.com/in/phyllis-chen-profile/",
            }
        },
        {
            position: officerPositions.FINANCE,
            name: "Brandon Mendoza",
            picture: _2023_brandon,
            socials: {
                linkedin: "https://www.linkedin.com/in/bwmendo/",
            }
        },
        {
            position: officerPositions.CREATIVE,
            name: "Sheamin Kim",
            picture: _2023_shea,
            socials: {
                linkedin: "https://www.linkedin.com/in/sheamin-kim-b21818250/",
            }
        },
        {
            position: officerPositions.PUBLIC_RELATIONS,
            name: "Ryan Louie",
            picture: _2023_ryan,
            socials: {
                linkedin: "https://www.linkedin.com/in/rylouie/",
            }
        },
        {
            position: officerPositions.OUTREACH,
            name: "Suraj Gangaram",
            picture: _2023_suraj,
            socials: {
                linkedin: "https://www.linkedin.com/in/suraj-gangaram/",
            }
        },
        {
            position: officerPositions.DIVERSITY,
            name: "Mari Woodworth",
            picture: _2023_mariko,
            socials: {
                linkedin: "https://www.linkedin.com/in/marikowoodworth/",
            }
        },
        {
            position: officerPositions.IT,
            name: "Eric Kim",
            picture: _2023_eric,
            socials: {
                linkedin: "https://www.linkedin.com/in/taehyunnkim/",
                github: "https://github.com/taehyunnkim"
            }
        },
        {
            position: officerPositions.ACADEMIC,
            name: "Bhavya Garlapati",
            picture: _2023_bhavya,
            socials: {
                linkedin: "https://www.linkedin.com/in/bhavya-garlapati-95ab46225/",
            }
        },
    ],
    [groupType.WEB_COMMITTEE]: [
        {
            position: officerPositions.IT,
            name: "Eric Kim",
            picture: _2023_eric,
            socials: {
                linkedin: "https://www.linkedin.com/in/taehyunnkim/",
                github: "https://github.com/taehyunnkim"
            }
        },
        {
            position: webDevPositions.BACK_END,
            name: "Harold Pham",
            picture: _2023_harold,
            socials: {
                linkedin: "https://www.linkedin.com/in/harold-pham-60b201177/",
                github: "https://github.com/HaroldPham"
            }
        },
        {
            position: webDevPositions.FRONT_BACK_END,
            name: "Carl Searle",
            picture: "",
        },
        {
            position: webDevPositions.UX_DESIGNER_FRONT_END,
            name: "Vera Guber",
            picture: _2023_vera,
            socials: {
                linkedin: "www.linkedin.com/in/vera-guber-527851229",
            }
        },
        {
            position: webDevPositions.UX_DESIGNER,
            name: "Madelyn Lee",
            picture: "",
        },
        {
            position: webDevPositions.GRAPHIC_DESIGNER,
            name: "Meiyao Lee",
            picture: "",
        },
    ],
    [groupType.CREATIVE_COMMITTEE]: [
        {
            position: creativeCommitteePositions.LEAD,
            name: "Sheamin Kim",
            picture: _2023_shea2,
            socials: {
                linkedin: "https://www.linkedin.com/in/sheamin-kim-b21818250/",
            }
        },
        {
            position: creativeCommitteePositions.MEMBER,
            name: "Meiyao Li",
            picture: "",
        },
        {
            position: creativeCommitteePositions.MEMBER,
            name: "Jada Nguyen",
            picture: _2023_jada,
            socials: {
                linkedin: "https://www.linkedin.com/in/jadanguyend/"
            }
        },
        {
            position: creativeCommitteePositions.MEMBER,
            name: "Shirley Yun",
            picture: _2023_shirley,
            socials: {
                linkedin: "https://www.linkedin.com/in/shirleyyun/"
            }
        }
    ],
    [groupType.DIVERSITY_COMMITTEE]: [
        {
            position: diversityCommitteePositions.LEAD,
            name: "Mari Woodworth",
            picture: _2023_mariko,
            socials: {
                linkedin: "https://www.linkedin.com/in/marikowoodworth/",
            }
        }
    ],
    [groupType.FYR]: [],
};