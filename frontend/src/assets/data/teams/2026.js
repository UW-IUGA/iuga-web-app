import { groupType } from "../Enum";
import { officerPositions } from "../Enum";

// Lower the resolution of the image if the picture looks grainy
// https://adobe.com/express/feature/image/resize
// https://stackoverflow.com/questions/74502978/object-fit-cover-gives-pixelated-images-on-chrome

/* 2026 officers images */
import _2026_abraham from "../officerPhotos/2025/abe.jpg";
import _2026_george from "../officerPhotos/2025/george.jpg";
import _2026_akshat from "../officerPhotos/2025/akshat.png";
import _2026_preeti from "../officerPhotos/2025/preeti.png";
import _2026_yonie from "../officerPhotos/2026/yonie.png";
import _2026_samantha from "../officerPhotos/2026/samantha.png";
import _2026_nitya from "../officerPhotos/2026/nitya.png";
import _2026_dia from "../officerPhotos/2026/dia.jpg";

export const team_2026 = {
  [groupType.OFFICERS]: [
    {
      position: officerPositions.PRESIDENT,
      name: "Abraham Gibson",
      picture: _2026_abraham,
      socials: {
        linkedin: "https://www.linkedin.com/in/abrahamgib/",
      },
    },
    {
      position: officerPositions.VICE_PRESIDENT,
      name: "Akshat Ghuge",
      picture: _2026_akshat,
      socials: {
        linkedin: "https://www.linkedin.com/in/akshat-ghuge/",
      },
    },
    {
      position: officerPositions.FINANCE,
      name: "George Lee",
      picture: _2026_george,
      socials: {
        linkedin: "https://www.linkedin.com/in/george-y-lee/",
      },
    },
    {
      position: officerPositions.CREATIVE,
      name: "Ellie Marsh",
      picture: null,
      socials: null,
    },
    {
      position: officerPositions.PUBLIC_RELATIONS,
      name: "Samantha Oh",
      picture: _2026_samantha,
      socials: null,
    },
    {
      position: officerPositions.OUTREACH,
      name: "Preeti Kotipalli",
      picture: _2026_preeti,
      socials: {
        linkedin: "https://www.linkedin.com/in/preeti-kotipalli/",
      },
    },
    {
      position: officerPositions.DIVERSITY,
      name: "Nitya Shankar",
      picture: _2026_nitya,
      socials: null,
    },
    {
      position: officerPositions.IT,
      name: "Yonie Rivera",
      picture: _2026_yonie,
      socials: {
        linkedin: "https://www.linkedin.com/in/yirivera/",
        github: "https://github.com/Isaiahriveraa",
        website: "https://yonierivera.com",
      },
    },
    {
      position: officerPositions.ACADEMIC,
      name: "Dia Dora",
      picture: _2026_dia,
      socials: null,
    },
  ],
};
