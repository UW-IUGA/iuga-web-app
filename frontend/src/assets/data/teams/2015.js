import { groupType } from "../Enum";
import { officerPositions } from "../Enum";

/* 2015 offcers images */
import _2015_sebring from "../officerPhotos/2015/Sebring.jpg";
import _2015_amaral from "../officerPhotos/2015/Amaral.jpg";
import _2015_mcdonough from "../officerPhotos/2015/Harry.jpg";
import _2015_yan from "../officerPhotos/2015/Yan.jpg";
import _2015_woehrle from "../officerPhotos/2015/Austin.jpg";
import _2015_watson from "../officerPhotos/2015/Watson.jpg";
import _2015_munn from "../officerPhotos/2015/Munn.jpg";
import _2015_lopez from "../officerPhotos/2015/Lopez.png";

export const team_2015 = {
    [groupType.OFFICERS]: [
        {
            position: officerPositions.PRESIDENT,
            name: "Daniel Sebring",
            picture: _2015_sebring,
            socials: {
                linkedin: "https://www.linkedin.com/in/danielsebring",
            }
        },
        {
            position: officerPositions.VICE_PRESIDENT,
            name: "Allison Amaral",
            picture: _2015_amaral,
            socials: {
                linkedin: "https://www.linkedin.com/in/allisonamaral",
            }
        },
        {
            position: officerPositions.FINANCE,
            name: "Harry McDonough",
            picture: _2015_mcdonough,
        },
        {
            position: officerPositions.PUBLIC_RELATIONS,
            name: "Kevin Yan",
            picture: _2015_yan,
            socials: {
                linkedin: "https://www.linkedin.com/in/kevinlyan",
            }
        },
        {
            position: officerPositions.OUTREACH,
            name: "Austin Woehrle",
            picture: _2015_woehrle,
            socials: {
                linkedin: "https://www.linkedin.com/in/austin-woehrle-75361a47",
            }
        },
        {
            position: officerPositions.OPERATIONS,
            name: "Linnea Watson",
            picture: _2015_watson,
            socials: {
                linkedin: "https://www.linkedin.com/in/linneawatson",
            }
        },
        {
            position: officerPositions.IT,
            name: "Hiram Munn",
            picture: _2015_munn,
            socials: {
                linkedin: "https://www.linkedin.com/in/hirammunn",
                website: "https://hmunn.com/",
                github: "http://www.github.com/hmunn",
            }
        },
        {
            position: officerPositions.DIVERSITY,
            name: "Jill Lopez",
            picture: _2015_lopez,
            socials: {
                linkedin: "https://www.linkedin.com/in/lopezjill",
            }
        },
    ]
}