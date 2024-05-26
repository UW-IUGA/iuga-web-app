import { groupType } from "../Enum";
import { officerPositions } from "../Enum";

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


export const team_2018 = {
    [groupType.OFFICERS]: [
        {
            position: officerPositions.PRESIDENT,
            name: "Andrea Chen",
            picture: _2018_andrea,
            socials: {
                linkedin: "https://www.linkedin.com/in/abchen",
                website: "http://abchen.com/",
                github: "https://github.com/andyblueyo",
            }
        },
        {
            position: officerPositions.VICE_PRESIDENT,
            name: "Manó Bárkovics",
            picture: _2018_mano,
            socials: {
                website: "http://manobarkovics.com/",
                linkedin: "https://www.linkedin.com/in/manobarkovics",
            }
        },
        {
            position: officerPositions.FINANCE,
            name: "Anton Zheng",
            picture: _2018_anton,
            socials: {
                linkedin: "https://www.linkedin.com/in/antonzheng",
            }
        },
        {
            position: officerPositions.CREATIVE,
            name: "Oorja Chowdhary",
            picture: _2018_oorja,
            socials: {
                linkedin: "https://www.linkedin.com/in/oorjac",
            }
        },
        {
            position: officerPositions.PUBLIC_RELATIONS,
            name: "Neha Yadav",
            picture: _2018_neha,
            socials: {
                linkedin: "https://www.linkedin.com/in/neha-yadav-2b6498109",
            }
        },
        {
            position: officerPositions.OUTREACH,
            name: "Cole French",
            picture: _2018_cole,
            socials: {
                linkedin: "https://www.linkedin.com/in/colemanfrench",
            }
        },
        {
            position: officerPositions.IT,
            name: "Kidus Sendeke",
            picture: _2018_kidus,
            socials: {
                linkedin: "https://www.linkedin.com/in/kidus-sendeke",
            }
        },
        {
            position: officerPositions.DIVERSITY,
            name: "Katie Goulding",
            picture: _2018_katie,
            socials: {
                linkedin: "https://www.linkedin.com/in/kate-goulding-613569164",
            }
        },
        {
            position: officerPositions.ACADEMIC,
            name: "Joseph Tsai",
            picture: _2018_joseph,
            socials: {
                linkedin: "https://www.linkedin.com/in/josephktsai",
            }
        },
    ],
}