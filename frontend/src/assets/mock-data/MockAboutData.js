import { aboutTags } from "./Enum";
import { groupType } from "./Enum";
import { officerPositions } from "./Enum";
// import { webDevPositions } from "./Enum";

/*2023 officers images*/
import _2023_phyllis from "../officerPhotos/2022/phyllischen.jpg";
import _2023_sirena from "../officerPhotos/2022/sirenaakopyan.jpg";
import _2023_suraj from "../officerPhotos/2023/SurajShankarGangaramimage.png";
import _2023_mariko from "../officerPhotos/2023/MarikoWoodworthimage.jpg";
import _2023_shea from "../officerPhotos/2023/SheaminKimimage.jpg";
import _2023_brandon from "../officerPhotos/2023/BrandonMendozaimage.jpg";
import _2023_ryan from "../officerPhotos/2023/RyanLouieimage.jpg";
import _2023_eric from "../officerPhotos/2023/erickim.jpg";
import _2023_bhavya from "../officerPhotos/2023/bhavya.jpg";

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

/* 2019 officer images */
import _2019_alejandro from "../officerPhotos/2019/alejandro.jpg";
import _2019_william from "../officerPhotos/2019/williamkwok.jpg";
import _2019_casey from "../officerPhotos/2019/caseytran.jpg";
import _2019_james from "../officerPhotos/2019/james.jpg";
import _2019_shruti from "../officerPhotos/2019/shrutir.jpg";
import _2019_allison from "../officerPhotos/2019/allison_lee.jpg";
import _2019_dayoung from "../officerPhotos/2019/dayoung.jpg";
import _2019_kiran from "../officerPhotos/2019/kiran.jpg";

/* 2018 officer images */
import _2018_andrea from "../officerPhotos/2018/andrea_chen.jpg";
import _2018_anton from "../officerPhotos/2018/anton_zheng.jpg";
import _2018_cole from "../officerPhotos/2018/cole_french.jpg";
import _2018_joseph from "../officerPhotos/2018/joseph_tsai.jpg";
import _2018_katie from "../officerPhotos/2018/katie_goulding.jpg";
import _2018_kidus from "../officerPhotos/2018/kidus_sendeke.jpg";
import _2018_mano from "../officerPhotos/2018/mano_barkovics.jpg";
import _2018_neha from "../officerPhotos/2018/neha_yadav.jpg";
import _2018_oorja from "../officerPhotos/2018/oorja_chowdhary.jpg";

/* 2017 officer images */
import _2017_alex from "../officerPhotos/2017/alex-gilbert.jpg";
import _2017_brendan from "../officerPhotos/2017/brendan-kellogg.jpg";
import _2017_chris from "../officerPhotos/2017/chris-oh.jpg";
import _2017_davin from "../officerPhotos/2017/davin-lee.jpg";
import _2017_ethan from "../officerPhotos/2017/ethan-anderson.jpg";
import _2017_jessica from "../officerPhotos/2017/jessica-libman.jpg";
import _2017_rosemary from "../officerPhotos/2017/rosemary-adams.jpg";
import _2017_sanjana from "../officerPhotos/2017/sanjana-galgalikar.jpg";
import _2017_daniel from "../officerPhotos/2017/daniel-hoang.jpg";

/* 2016 officer images */
import _2016_belltowne from "../officerPhotos/2016/alexander-bell-towne.jpg";
import _2016_leeds from "../officerPhotos/2016/benjamin-leeds.jpg";
import _2016_holland from "../officerPhotos/2016/brad-holland.jpg";
import _2016_han from "../officerPhotos/2016/jenna-han.jpg";
import _2016_li from "../officerPhotos/2016/jonathan-li.jpg";
import _2016_dietzler from "../officerPhotos/2016/natasha-dietzler.jpg";
import _2016_le from "../officerPhotos/2016/royce-le.jpg";
import _2016_patel from "../officerPhotos/2016/rutvi-patel.jpg";

/* 2015 offcers images */
import _2015_sebring from "../officerPhotos/2015/Sebring.jpg";
import _2015_amaral from "../officerPhotos/2015/Amaral.jpg";
import _2015_mcdonough from "../officerPhotos/2015/Harry.jpg";
import _2015_yan from "../officerPhotos/2015/Yan.jpg";
import _2015_woehrle from "../officerPhotos/2015/Austin.jpg";
import _2015_watson from "../officerPhotos/2015/Watson.jpg";
import _2015_munn from "../officerPhotos/2015/Munn.jpg";
import _2015_lopez from "../officerPhotos/2015/Lopez.png";

export const mockMembers = {
    memberYears: {
        // 2024: {
        //     [groupType.OFFICERS]: [
        //         {
        //             position: officerPositions.PRESIDENT,
        //             name: "Sheamin Kim",
        //             picture: "", //_2024_sheamin
        //         },
        //         {
        //             position: officerPositions.VICE_PRESIDENT,
        //             name: "Akash Shrestha",
        //             picture: "", //_2024_akash
        //         },
        //         {
        //             position: officerPositions.FINANCE,
        //             name: "",
        //             picture: "",
        //         },
        //         {
        //             position: officerPositions.CREATIVE,
        //             name: "Shirley Yun",
        //             picture: "", //_2024_shirley
        //         },
        //         {
        //             position: officerPositions.PUBLIC_RELATIONS,
        //             name: "Jada Nguyen",
        //             picture: "", //_2024_jada
        //         },
        //         {
        //             position: officerPositions.OUTREACH,
        //             name: "",
        //             picture: "",
        //         },
        //         {
        //             position: officerPositions.DIVERSITY,
        //             name: "",
        //             picture: "",
        //         },
        //         {
        //             position: officerPositions.IT,
        //             name: "Michaela Tran",
        //             picture: "",
        //         },
        //         {
        //             position: officerPositions.ACADEMIC,
        //             name: "",
        //             picture: "",
        //         },
        //     ],
        //     [groupType.WEB_COMMITTEE]: [],
        //     [groupType.CREATIVE_COMMITTEE]: [],
        //     [groupType.FYR]: [],
        // },
        2023: {
            [groupType.OFFICERS]: [
                {
                    position: officerPositions.COPRESIDENT,
                    name: "Sirena Akopyans",
                    picture: _2023_sirena,
                    linkedin: "https://www.linkedin.com/in/sirena-akopyan/",
                },
                {
                    position: officerPositions.COPRESIDENT,
                    name: "Phyllis Chen",
                    picture: _2023_phyllis,
                    linkedin: "https://www.linkedin.com/in/phyllis-chen-profile/",
                },
                {
                    position: officerPositions.FINANCE,
                    name: "Brandon Mendoza",
                    picture: _2023_brandon,
                    linkedin: "https://www.linkedin.com/in/bwmendo/",
                },
                {
                    position: officerPositions.CREATIVE,
                    name: "Sheamin Kim",
                    picture: _2023_shea,
                    linkedin: "https://www.linkedin.com/in/sheamin-kim-b21818250/",
                },
                {
                    position: officerPositions.PUBLIC_RELATIONS,
                    name: "Ryan Louie",
                    picture: _2023_ryan,
                    linkedin: "https://www.linkedin.com/in/rylouie/",
                },
                {
                    position: officerPositions.OUTREACH,
                    name: "Suraj Gangaram",
                    picture: _2023_suraj,
                    linkedin: "https://www.linkedin.com/in/suraj-gangaram/",
                },
                {
                    position: officerPositions.DIVERSITY,
                    name: "Mari Woodworth",
                    picture: _2023_mariko,
                    linkedin: "https://www.linkedin.com/in/marikowoodworth/",
                },
                {
                    position: officerPositions.IT,
                    name: "Eric Kim",
                    picture: _2023_eric,
                    linkedin: "https://www.linkedin.com/in/taehyunnkim/",
                },
                {
                    position: officerPositions.ACADEMIC,
                    name: "Bhavya Garlapati",
                    picture: _2023_bhavya,
                    linkedin: "https://www.linkedin.com/in/bhavya-garlapati-95ab46225/",
                },
            ],
            [groupType.WEB_COMMITTEE]: [
                // {
                //     position: webDevPositions.LEAD,
                //     name: "Eric Kim",
                //     picture: "",
                // },
                // {
                //     position: webDevPositions.BACK_END,
                //     name: "Harold Pham",
                //     picture: "",
                // },
                // {
                //     position: webDevPositions.UX_DESIGNER_FRONT_END,
                //     name: "Vera Guber",
                //     picture: "",
                // },
                // {
                //     position: webDevPositions.FRONT_BACK_END,
                //     name: "Carl Searle",
                //     picture: "",
                // },
                // {
                //     position: webDevPositions.UX_DESIGNER,
                //     name: "Madelyn Lee",
                //     picture: "",
                // },
            ],
            [groupType.CREATIVE_COMMITTEE]: [],
            [groupType.FYR]: [],
        },
        2020: {
            [groupType.OFFICERS]: [
                {
                    position: officerPositions.PRESIDENT,
                    name: "Kiran Pradan",
                    picture: _2020_kiran,
                    github: "https://github.com/kiranpradhan01",
                    linkedin: "https://www.linkedin.com/in/kiran-pradhan/",
                },
                {
                    position: officerPositions.VICE_PRESIDENT,
                    name: "Jacinda Eng",
                    picture: _2020_jacinda,
                    linkedin: "https://www.linkedin.com/in/jacinda-eng-6432a8171",
                    github: "https://github.com/jacindaeng",
                    website: "https://jacindaeng.com/",
                },
                {
                    position: officerPositions.FINANCE,
                    name: "Alexander Sanchez",
                    picture: _2020_alexander,
                    github: "https://github.com/AlexanderES",
                    linkedin: "https://www.linkedin.com/in/alexander-escalera-503360176/",
                },
                {
                    position: officerPositions.CREATIVE,
                    name: "Jojo Saunders",
                    picture: _2020_jojo,
                    linkedin: "https://www.linkedin.com/in/jojosaunders/",
                    website: "https://www.jojosaunders.me/",
                },
                {
                    position: officerPositions.PUBLIC_RELATIONS,
                    name: "Cheryl Wu",
                    picture: _2020_cheryl,
                    linkedin: "https://www.linkedin.com/in/cheryl-wu-59baa8174",
                    website: "https://wucheryl.com",
                },
                {
                    position: officerPositions.OUTREACH,
                    name: "Ana De Las Alas",
                    picture: _2020_ana,
                    github: "https://github.com/dayoungcheong",
                    linkedin: "https://www.linkedin.com/in/ana-de-las-alas/",
                },
                {
                    position: officerPositions.DIVERSITY,
                    name: "Aaron Zhao",
                    picture: _2020_aaron,
                    linkedin: "https://www.linkedin.com/in/zhaoaaron/",
                    website: "https://www.aaronzhao.io/",
                },
                {
                    position: officerPositions.IT,
                    name: "Andrey Butenko",
                    picture: _2020_andrey,
                    github: "https://github.com/andreybutenko",
                    linkedin: "https://www.linkedin.com/in/butenkoandrey/",
                    website: "https://andreybutenko.com/",
                },
                {
                    position: officerPositions.ACADEMIC,
                    name: "Joseph Altamira",
                    picture: _2020_joseph,
                    github: "https://github.com/Jornalt",
                    linkedin: "https://www.linkedin.com/in/joseph-altamira-0b0a22161/",
                },
            ],
            [groupType.WEB_COMMITTEE]: [],
            [groupType.CREATIVE_COMMITTEE]: [],
            [groupType.FYR]: [],
        },
        2019: {
            [groupType.OFFICERS]: [
                {
                    position: officerPositions.PRESIDENT,
                    name: "Alejandro Huante",
                    picture: _2019_alejandro,
                    github: "https://github.com/ahuante-1741170",
                    linkedin: "https://www.linkedin.com/in/alejandro-huante-28533a141/",
                },
                {
                    position: officerPositions.VICE_PRESIDENT,
                    name: "James Kim",
                    picture: _2019_james,
                    github: "https://github.com/thejameskim",
                    linkedin: "https://www.linkedin.com/in/thejameskim/",
                },
                {
                    position: officerPositions.FINANCE,
                    name: "Kiran Pradhan",
                    picture: _2019_kiran,
                    github: "https://github.com/kiranpradhan01",
                    linkedin: "https://www.linkedin.com/in/kiran-pradhan-aa8861162/",
                },
                {
                    position: officerPositions.CREATIVE,
                    name: "Casey Tran",
                    picture: _2019_casey,
                    linkedin: "https://www.linkedin.com/in/caseytran/",
                },
                {
                    position: officerPositions.PUBLIC_RELATIONS,
                    name: "Allison Lee",
                    picture: _2019_allison,
                    github: "https://github.com/alliL",
                    linkedin: "https://www.linkedin.com/in/allison20/",
                },
                {
                    position: officerPositions.OUTREACH,
                    name: "Dayoung Cheong",
                    picture: _2019_dayoung,
                    github: "https://github.com/dayoungcheong",
                    linkedin: "https://www.linkedin.com/in/dayoungcheong/",
                },
                {
                    position: officerPositions.IT,
                    name: "William Kwok",
                    picture: _2019_william,
                    github: "https://github.com/kwokwilliam",
                    linkedin: "https://www.linkedin.com/in/william-w-kwok/",
                    website: "https://williamk.info",
                },
                {
                    position: officerPositions.ACADEMIC,
                    name: "Shruti Rajagopalan",
                    picture: _2019_shruti,
                    github: "https://github.com/ShrutiR5",
                    linkedin: "https://www.linkedin.com/in/shrutira/",
                },
            ],
            [groupType.WEB_COMMITTEE]: [],
            [groupType.CREATIVE_COMMITTEE]: [],
            [groupType.FYR]: [],
        },
        2018: {
            [groupType.OFFICERS]: [
                {
                    position: officerPositions.PRESIDENT,
                    name: "Andrea Chen",
                    picture: _2018_andrea,
                    linkedin: "https://www.linkedin.com/in/abchen",
                    website: "http://abchen.com/",
                    github: "https://github.com/andyblueyo",
                },
                {
                    position: officerPositions.VICE_PRESIDENT,
                    name: "Manó Bárkovics",
                    picture: _2018_mano,
                    website: "http://manobarkovics.com/",
                    linkedin: "https://www.linkedin.com/in/manobarkovics",
                },
                {
                    position: officerPositions.FINANCE,
                    name: "Anton Zheng",
                    picture: _2018_anton,
                    linkedin: "https://www.linkedin.com/in/antonzheng",
                },
                {
                    position: officerPositions.CREATIVE,
                    name: "Oorja Chowdhary",
                    picture: _2018_oorja,
                    linkedin: "https://www.linkedin.com/in/oorjac",
                },
                {
                    position: officerPositions.PUBLIC_RELATIONS,
                    name: "Neha Yadav",
                    picture: _2018_neha,
                    linkedin: "https://www.linkedin.com/in/neha-yadav-2b6498109",
                },
                {
                    position: officerPositions.OUTREACH,
                    name: "Cole French",
                    picture: _2018_cole,
                    linkedin: "https://www.linkedin.com/in/colemanfrench",
                },
                {
                    position: officerPositions.IT,
                    name: "Kidus Sendeke",
                    picture: _2018_kidus,
                    linkedin: "https://www.linkedin.com/in/kidus-sendeke",
                },
                {
                    position: officerPositions.DIVERSITY,
                    name: "Katie Goulding",
                    picture: _2018_katie,
                    linkedin: "https://www.linkedin.com/in/kate-goulding-613569164",
                },
                {
                    position: officerPositions.ACADEMIC,
                    name: "Joseph Tsai",
                    picture: _2018_joseph,
                    linkedin: "https://www.linkedin.com/in/josephktsai",
                },
            ],
            [groupType.WEB_COMMITTEE]: [],
            [groupType.CREATIVE_COMMITTEE]: [],
            [groupType.FYR]: [],
        },
        2017: {
            [groupType.OFFICERS]: [
                {
                    position: officerPositions.PRESIDENT,
                    name: "Ethan Anderson",
                    picture: _2017_ethan,
                    linkedin: "https://www.linkedin.com/in/aethanol",
                },
                {
                    position: officerPositions.VICE_PRESIDENT,
                    name: "Jessica Libman",
                    picture: _2017_jessica,
                    linkedin: "https://www.linkedin.com/in/jessica-libman",
                },
                {
                    position: officerPositions.FINANCE,
                    name: "Davin Lee",
                    picture: _2017_davin,
                },
                {
                    position: officerPositions.CREATIVE,
                    name: "Daniel Hoang",
                    picture: _2017_daniel,
                    linkedin: "https://www.linkedin.com/in/dhoang48",
                },
                {
                    position: officerPositions.PUBLIC_RELATIONS,
                    name: "Alex Gilbert",
                    picture: _2017_alex,
                },
                {
                    position: officerPositions.OUTREACH,
                    name: "Sanjana Galgalikar",
                    picture: _2017_sanjana,
                    linkedin: "https://www.linkedin.com/in/sanjanagalgalikar",
                },
                {
                    position: officerPositions.IT,
                    name: "Brendan Kellogg",
                    picture: _2017_brendan,
                    linkedin: "https://www.linkedin.com/in/brendankellogg",
                },
                {
                    position: officerPositions.DIVERSITY,
                    name: "Rosemary Adams",
                    picture: _2017_rosemary,
                    linkedin: "https://www.linkedin.com/in/rosemary-adams-067499104",
                },
                {
                    position: officerPositions.ACADEMIC,
                    name: "Chris Oh",
                    picture: _2017_chris,
                    linkedin: "https://www.linkedin.com/in/bummookoh",
                },
            ],
            [groupType.WEB_COMMITTEE]: [],
            [groupType.CREATIVE_COMMITTEE]: [],
            [groupType.FYR]: [],
        },
        2016: {
            [groupType.OFFICERS]: [
                {
                    position: officerPositions.PRESIDENT,
                    name: "Jonathan Li",
                    picture: _2016_li,
                    linkedin: "https://www.linkedin.com/in/jonathanpli",
                    github: "https://github.com/jonathanpli",
                },
                {
                    position: officerPositions.VICE_PRESIDENT,
                    name: "Rutvi Patel",
                    picture: _2016_patel,
                    linkedin: "https://www.linkedin.com/in/rutvimpatel",
                    github: "https://github.com/rutvimpatel",
                },
                {
                    position: officerPositions.FINANCE,
                    name: "Benjamin Leeds",
                    picture: _2016_leeds,
                    linkedin: "https://www.linkedin.com/in/benjaminleeds",
                },
                {
                    position: officerPositions.CREATIVE,
                    name: "Jenna Han",
                    picture: _2016_han,
                    linkedin: "https://www.linkedin.com/in/jennahan",
                },
                {
                    position: officerPositions.PUBLIC_RELATIONS,
                    name: "Brad Holland",
                    picture: _2016_holland,
                    linkedin: "https://www.linkedin.com/in/bradleyrholland",
                },
                {
                    position: officerPositions.OUTREACH,
                    name: "Natasha Dietzler",
                    picture: _2016_dietzler,
                    linkedin: "https://www.linkedin.com/in/ndietzler",
                },
                {
                    position: officerPositions.IT,
                    name: "Alexander Bell-Towne",
                    picture: _2016_belltowne,
                    linkedin: "https://www.linkedin.com/in/alexbbt",
                    github: "https://github.com/alexbbt",
                },
                {
                    position: officerPositions.DIVERSITY,
                    name: "Royce Le",
                    picture: _2016_le,
                    linkedin: "https://www.linkedin.com/in/roycevanle",
                },
            ],
            [groupType.WEB_COMMITTEE]: [],
            [groupType.CREATIVE_COMMITTEE]: [],
            [groupType.FYR]: [],
        },
        2015: {
            [groupType.OFFICERS]: [
                {
                    position: officerPositions.PRESIDENT,
                    name: "Daniel Sebring",
                    linkedin: "https://www.linkedin.com/in/danielsebring",
                    picture: _2015_sebring,
                },
                {
                    position: officerPositions.VICE_PRESIDENT,
                    name: "Allison Amaral",
                    linkedin: "https://www.linkedin.com/in/allisonamaral",
                    picture: _2015_amaral,
                },
                {
                    position: officerPositions.FINANCE,
                    name: "Harry McDonough",
                    picture: _2015_mcdonough,
                },
                {
                    position: officerPositions.PUBLIC_RELATIONS,
                    name: "Kevin Yan",
                    linkedin: "https://www.linkedin.com/in/kevinlyan",
                    picture: _2015_yan,
                },
                {
                    position: officerPositions.OUTREACH,
                    name: "Austin Woehrle",
                    linkedin: "https://www.linkedin.com/in/austin-woehrle-75361a47",
                    picture: _2015_woehrle,
                },
                {
                    position: officerPositions.OPERATIONS,
                    name: "Linnea Watson",
                    linkedin: "https://www.linkedin.com/in/linneawatson",
                    picture: _2015_watson,
                },
                {
                    position: officerPositions.IT,
                    name: "Hiram Munn",
                    linkedin: "https://www.linkedin.com/in/hirammunn",
                    website: "https://hmunn.com/",
                    github: "http://www.github.com/hmunn",
                    picture: _2015_munn,
                },
                {
                    position: officerPositions.DIVERSITY,
                    name: "Jill Lopez",
                    linkedin: "https://www.linkedin.com/in/lopezjill",
                    picture: _2015_lopez,
                },
            ],
            [groupType.WEB_COMMITTEE]: [],
            [groupType.CREATIVE_COMMITTEE]: [],
            [groupType.FYR]: [],
        },
    },
    positionInformation: {
        [officerPositions.PRESIDENT]: {
            description: "The President is the head of IUGA and their responsibilities include:",
            responsibilities: [
                "Lead IUGA Meetings",
                "Represent Informatics to faculty and staff with the Vice President",
                "Shepherd and guide newly elected IUGA Officers during the annual transition",
                "Act as backup for the Director of Finance for financial matters",
                "Act as, or designate, the Informatics Representative On the iSchool Program Committee",
                "Act as liaison to other iSchool student organizations",
            ],
        },
        [officerPositions.COPRESIDENT]: {
            description: "The Co-Presidents are the joint heads of IUGA and their responsibilities include:",
            responsibilities: [
                "Co-lead IUGA Meetings",
                "Assist each other in representing Informatics to faculty and staff",
                "Shepherd and guide newly elected IUGA Officers during the annual transition",
                "Act as backup for the Director of Finance for financial matters",
                "Act as, or designate, the Informatics Representative On the iSchool Program Committee",
                "Act as liaison to other iSchool student organizations",
            ],
        },
        [officerPositions.VICE_PRESIDENT]: {
            description:
                "The Vice President fills roles as needed and has core repsonsibilities with which they are entrusted. These core responsibilities include the following:",
            responsibilities: [
                "Backup for the President",
                "Collaborates with the Director of Outreach when communicating with External Groups",
                "Responsible for scheduling bi-weekly meetings",
                "Responsible for booking venues for all IUGA events",
                "Responsible for handling the yearly Registration of IUGA with the SAO",
                "Responsible for the meeting minutes of every IUGA meeting",
                "Act as the Primary Point of Contact for Student Services when dealing with the Informatics Recruitment Process",
                "Fulfill or Designate a student to fill a seat on the iSchool Student Leadership Committee and the Informatics Program Committee",
            ],
        },
        [officerPositions.FINANCE]: {
            description:
                "The director of finance maintains the Association’s financial records. This includes the following items:",
            responsibilities: [
                "Maintain the Financial Records",
                "Provide Reports On Finances to IUGA",
                "Fulfill or Designate a Student Representative for Informatics on the iSchool Student Leadership Committee",
                "Organize the Financial Vectors of IUGA fundraising efforts",
                "Prepare and Submit the Yearly IUGA Budget to iSchool Administration",
                "Act as the Primary Account Holder for All IUGA Financial Accounts",
                "Handle merchandise ordering and distribution",
                "Help the incoming Director of Finance with the Yearly Budget during Spring Quarter",
            ],
        },
        [officerPositions.CREATIVE]: {
            description:
                "The Creative Director will work on creating the visual style of the IUGA brand and take initiative in creating and delivering branded items. These responsibilities will include:",
            responsibilities: [
                "Creating merchandise for IUGA, including clothing",
                "Creating informational posters/flyers for IUGA events",
                "Maintain the IUGA logo and design styling",
                "Create a team to help in the creation of Informatics branded items",
                "Assist Finance with ordering and distribution of merchandise",
            ],
        },
        [officerPositions.PUBLIC_RELATIONS]: {
            description:
                "The Director of Public Relations serves a vital communication role within the Executive Council. These responsibilities Include:",
            responsibilities: [
                "Communicate Announcement and Events to Informatics Students",
                "Lead the Planning and Organization of Social Events",
                "Ensure the Smooth Operation and Execution of All IUGA events",
                "Oversee Elections",
            ],
        },
        [officerPositions.OUTREACH]: {
            description:
                "The Director of Outreach is responsible for representing both the Informatics Program and the IUGA to the professional community. They do this by:",
            responsibilities: [
                "Working with Students Services and the Career Center to promote employment and professional development events.",
                "Work with Student Services to facilitate alumni relations",
                "Promote Informatics to the University of Washington at Large and the Professional Community Along with the Vice President",
                "Responsible for organizing and executing professional development events for Informatics",
            ],
        },
        [officerPositions.DIVERSITY]: {
            description:
                "The Director of Diversity Efforts works to promote diversity both within the major and the iSchool. This includes, but is not limited to, the following:",
            responsibilities: [
                "Support and promote activist-oriented RSOs",
                "Organize and promote diversity and inclusion events for the iSchool",
                "Work closely with the Diversity Programs Advisor to ideate and execute diversity initiatives",
                "Support and engage in an active Diversity Committee composed of students, faculty and staff",
                "Fulfill, or appoint a student, to sit on the Informatics Admissions Committee during the summer",
                "Ensure that the events, ideas, and products of IUGA are made with the thought of diversity and inclusion",
                "Collaborate with Student Services and other Registered Student Organizations (RSOs) on campus for diversity and inclusion events",
            ],
        },
        [officerPositions.IT]: {
            description:
                "The Director of Information Technology helps run the Association’s technology projects and online presence. While providing support when needed. This is done by doing the following:",
            responsibilities: [
                "Maintain and update the IUGA Website and associated websites using the latest web technologies",
                "Monitor and maintain the IUGA gaming servers and associated assets",
                "Maintain all IUGA online account credentials in a secure and scalable system",
                "Manage permissions and security settings for IUGA assets across social networks and collaborative systems",
                "Oversee and run technology aspects of IUGA events, including the quarterly Game Night",
                "Work closely with iSchool IT and the Administration to connect the student body with all available technology and services",
                "Support, Service, and Create Technology solutions for needs within the Association and the iSchool",
            ],
        },
        [officerPositions.ACADEMIC]: {
            description:
                "The Director of Academic Support is responsible for supporting the academic needs within the Informatics Program. These responsibilities include:",
            responsibilities: [
                "Understand the needs of current students",
                "Organize and promote academic related events",
                "Work closely with other organizations to conduct joint events",
            ],
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
