import { groupType } from "../Enum";
import { officerPositions } from "../Enum";
import { creativeCommitteePositions, diversityCommitteePositions, itCommitteePositions } from "../Enum";

// Lower the resolution of the image if the picture looks grainy
// https://adobe.com/express/feature/image/resize
// https://stackoverflow.com/questions/74502978/object-fit-cover-gives-pixelated-images-on-chrome

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
import _2024_preeti from "../officerPhotos/2024/officer_preeti.png";
import _2024_aidan from "../officerPhotos/2024/member_aidan.jpg";
import _2024_camilo from "../officerPhotos/2024/member_camilo.jpeg";
import _2024_carolyn from "../officerPhotos/2024/member_carolyn.jpg";
import _2024_vera from "../officerPhotos/2024/member_vera.jpg";
import _2024_jasmine from "../officerPhotos/2024/member_jasmine.jpg";
import _2024_candra from "../officerPhotos/2024/member_candra.jpg";
import _2024_elizabeth from "../officerPhotos/2024/member_elizabeth.jpg";
import _2024_joy from "../officerPhotos/2024/member_joy.jpg";
import _2024_steven from "../officerPhotos/2024/member_steven.JPG";
import _2024_aarya from "../officerPhotos/2024/member_aarya.png";
import _2024_carlos from "../officerPhotos/2024/member_carlos.JPG";
import _2024_diana from "../officerPhotos/2024/member_diana.jpg";
import _2024_faith from "../officerPhotos/2024/member_faith.jpg";

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
}