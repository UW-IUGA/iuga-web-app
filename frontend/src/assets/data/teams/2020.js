import { groupType } from "../Enum";
import { officerPositions } from "../Enum";


/* 2020 officer images */
import _2020_kiran from "../officerPhotos/2020/kiranpradhan.jpg";
import _2020_jacinda from "../officerPhotos/2020/jacindaeng.jpg";
import _2020_alexander from "../officerPhotos/2020/alexandersanchez.jpg";
import _2020_jojo from "../officerPhotos/2020/jojosaunders.jpg";
import _2020_cheryl from "../officerPhotos/2020/cherylwu.jpg";
import _2020_ana from "../officerPhotos/2020/anadelasalas.jpg";
import _2020_aaron from "../officerPhotos/2020/aaronzhao.jpg";
import _2020_andrey from "../officerPhotos/2020/andreybutenko.jpg";
import _2020_joseph from "../officerPhotos/2020/josephaltamira.jpg";
// import fyr1 from '../officerPhotos/2020/justin-fyr.jpg';
// import fyr2 from '../officerPhotos/2020/sachi-fyr.jpg';

export const team_2020 = {
    [groupType.OFFICERS]: [
        {
            position: officerPositions.PRESIDENT,
            name: "Kiran Pradan",
            picture: _2020_kiran,
            socials: {
                github: "https://github.com/kiranpradhan01",
                linkedin: "https://www.linkedin.com/in/kiran-pradhan/",
            }
        },
        {
            position: officerPositions.VICE_PRESIDENT,
            name: "Jacinda Eng",
            picture: _2020_jacinda,
            socials: {
                linkedin: "https://www.linkedin.com/in/jacinda-eng-6432a8171",
                github: "https://github.com/jacindaeng",
                website: "https://jacindaeng.com/",
            }
        },
        {
            position: officerPositions.FINANCE,
            name: "Alexander Sanchez",
            picture: _2020_alexander,
            socials: {
                github: "https://github.com/AlexanderES",
                linkedin: "https://www.linkedin.com/in/alexander-escalera-503360176/",
            }
        },
        {
            position: officerPositions.CREATIVE,
            name: "Jojo Saunders",
            picture: _2020_jojo,
            socials: {
                linkedin: "https://www.linkedin.com/in/jojosaunders/",
                website: "https://www.jojosaunders.me/",
            }
        },
        {
            position: officerPositions.PUBLIC_RELATIONS,
            name: "Cheryl Wu",
            picture: _2020_cheryl,
            socials: {
                linkedin: "https://www.linkedin.com/in/cheryl-wu-59baa8174",
                website: "https://wucheryl.com",
            }
        },
        {
            position: officerPositions.OUTREACH,
            name: "Ana De Las Alas",
            picture: _2020_ana,
            socials: {
                github: "https://github.com/dayoungcheong",
                linkedin: "https://www.linkedin.com/in/ana-de-las-alas/",
            }
        },
        {
            position: officerPositions.DIVERSITY,
            name: "Aaron Zhao",
            picture: _2020_aaron,
            socials: {
                linkedin: "https://www.linkedin.com/in/zhaoaaron/",
                website: "https://www.aaronzhao.io/",
            }
        },
        {
            position: officerPositions.IT,
            name: "Andrey Butenko",
            picture: _2020_andrey,
            socials: {
                github: "https://github.com/andreybutenko",
                linkedin: "https://www.linkedin.com/in/butenkoandrey/",
                website: "https://andreybutenko.com/",
            }
        },
        {
            position: officerPositions.ACADEMIC,
            name: "Joseph Altamira",
            picture: _2020_joseph,
            socials: {
                github: "https://github.com/Jornalt",
                linkedin: "https://www.linkedin.com/in/joseph-altamira-0b0a22161/",
            }
        },
    ],
}