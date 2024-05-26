import { groupType } from "../Enum";
import { officerPositions } from "../Enum";
import { webDevPositions, creativeCommitteePositions, diversityCommitteePositions } from "../Enum";

import aaron from '../officerPhotos/2021/aaronzhao.jpg';
import justin from '../officerPhotos/2021/justinzeng.jpg';
import sachi from '../officerPhotos/2021/sachifigliolini.jpg';
import anika from '../officerPhotos/2021/anikamishra.jpg';
import augene from '../officerPhotos/2021/augenepak.jpg';
import kelsey from '../officerPhotos/2021/kelseylu.jpg';
import pranav from '..//officerPhotos/2021/pranavshekar.jpg';
import shruti from '../officerPhotos/2021/shrutikompella.jpg';
import kavya from '../officerPhotos/2021/kavyaiyer.jpg';
import sirena from '../officerPhotos/2021/sirenaakopyan.jpg';
import phyllis from '../officerPhotos/2021/phyllischen.jpg';

export const team_2021 = {
    [groupType.OFFICERS]: [
        {
			position: officerPositions.PRESIDENT,
            name: "Aaron Zhao",
            picture: aaron,
            socials: {
                linkedin: "https://www.linkedin.com/in/zhaoaaron/",
                website: "https://www.aaronzhao.io/"
            }
		},
		{
			position: officerPositions.VICE_PRESIDENT,
			name: "Justin Zeng",
			picture: justin,
            socials: {
                github: 'https://github.com/Once28',
                linkedin: "https://www.linkedin.com/in/justin-zeng-3b7b47165/"
            }
		},
		{
			position: officerPositions.FINANCE,
			name: "Sachi Figliolini",
			picture: sachi,
            socials: {
                linkedin: "http://www.linkedin.com/in/sachi-figliolini/"
            }
		},
		{
			position: officerPositions.CREATIVE,
			name: "Anika Mishra",
			picture: anika,
            socials: {
                linkedin: "http://linkedin.com/in/anikamishra",
                website: "http://anikamishra.com"
            }
		},
		{
			position: officerPositions.PUBLIC_RELATIONS,
			name: "Augene Pak",
            picture: augene,
            socials: {
                linkedin: "https://www.linkedin.com/in/augenepak/",
                website: "https://augene.github.io/"
            }
		},
		{
			position: officerPositions.OUTREACH,
			name: "Kelsey Lu",
			picture: kelsey,
            socials: {
                linkedin: "http://www.linkedin.com/in/kelseylu612/"
            }
		},
		{
			position: officerPositions.DIVERSITY,
			name: "Pranav Shekar",
            picture: pranav,
            socials: {
                linkedin: "https://www.linkedin.com/in/pranav-shekar/",
                website: "http://pranavshekar.com/"
            }
		},
		{
			position: officerPositions.IT,
			name: "Shruti Kompella",
			picture: shruti,
            socials: {
                linkedin: "https://www.linkedin.com/in/shruti-k-9a561a173"
            }
		},
		{
			position: officerPositions.ACADEMIC,
			name: "Kavya Iyer",
            picture: kavya,
            socials: {
                linkedin: "https://www.linkedin.com/in/kavyaiyer"
            }
		}
    ],
    [groupType.FYR]: [
        {
            position: officerPositions.FYR,
            name: "Sirena Akopyans",
            picture: sirena,
            socials: {
                linkedin: "https://www.linkedin.com/in/sirena-akopyan/",
            }
        },
        {
            position: officerPositions.FYR,
            name: "Phyllis Chen",
            picture: phyllis,
            socials: {
                linkedin: "https://www.linkedin.com/in/phyllis-chen-profile/",
            }
        },
    ]
}