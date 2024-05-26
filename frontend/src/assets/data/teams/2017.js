import { groupType } from "../Enum";
import { officerPositions } from "../Enum";

/* 2017 officer images */
import _2017_alex from "../officerPhotos/2017/alex-gilbert.jpg";
import _2017_brendan from "../officerPhotos/2017/brendan-kellogg.jpg";
import _2017_chris from "../officerPhotos/2017/chris-oh.jpg";
import _2017_davin from "../officerPhotos/2017/davinlee.jpeg";
import _2017_ethan from "../officerPhotos/2017/ethan-anderson.jpg";
import _2017_jessica from "../officerPhotos/2017/jessica-libman.jpg";
import _2017_rosemary from "../officerPhotos/2017/rosemary-adams.jpg";
import _2017_sanjana from "../officerPhotos/2017/sanjana-galgalikar.jpg";
import _2017_daniel from "../officerPhotos/2017/daniel-hoang.jpg";


export const team_2017 = {
    [groupType.OFFICERS]: [
        {
            position: officerPositions.PRESIDENT,
            name: "Ethan Anderson",
            picture: _2017_ethan,
            socials: {
                linkedin: "https://www.linkedin.com/in/aethanol",
            }
        },
        {
            position: officerPositions.VICE_PRESIDENT,
            name: "Jessica Libman",
            picture: _2017_jessica,
            socials: {
                linkedin: "https://www.linkedin.com/in/jessica-libman",
            }
        },
        {
            position: officerPositions.FINANCE,
            name: "Davin Lee",
            picture: _2017_davin,
            socials: {
                linkedin: "https://www.linkedin.com/in/davin-lee/"
            }
        },
        {
            position: officerPositions.CREATIVE,
            name: "Daniel Hoang",
            picture: _2017_daniel,
            socials: {
                linkedin: "https://www.linkedin.com/in/dhoang48",
            }
        },
        {
            position: officerPositions.PUBLIC_RELATIONS,
            name: "Alex Gilbert",
            picture: _2017_alex,
            socials: {
                linkedin: "https://www.linkedin.com/in/aygilbe/"
            }
        },
        {
            position: officerPositions.OUTREACH,
            name: "Sanjana Galgalikar",
            picture: _2017_sanjana,
            socials: {
                linkedin: "https://www.linkedin.com/in/sanjanagalgalikar",
            }
        },
        {
            position: officerPositions.IT,
            name: "Brendan Kellogg",
            picture: _2017_brendan,
            socials: {
                linkedin: "https://www.linkedin.com/in/brendankellogg",
            }
        },
        {
            position: officerPositions.DIVERSITY,
            name: "Rosemary Adams",
            picture: _2017_rosemary,
            socials: {
                linkedin: "https://www.linkedin.com/in/rosemary-adams-067499104",
            }
        },
        {
            position: officerPositions.ACADEMIC,
            name: "Chris Oh",
            picture: _2017_chris,
            socials: {
                linkedin: "https://www.linkedin.com/in/bummookoh",
            }
        },
    ]
}