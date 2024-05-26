import { groupType } from "../Enum";
import { officerPositions } from "../Enum";
import { webDevPositions, creativeCommitteePositions, diversityCommitteePositions } from "../Enum";

import _brianna from '../officerPhotos/2022/brianna.jpg';
import _devina from '../officerPhotos/2022/devinaTavathia.jpg';
import _drew from '../officerPhotos/2022/drewFavors.jpg';
import _justin from '../officerPhotos/2022/justinZeng.jpg';
import _phyllis from '../officerPhotos/2022/phyllischen.jpg';
import _pranav from '../officerPhotos/2022/pranavshekar.jpg';
import _sachi from '../officerPhotos/2022/sachiFigliolini.jpg';
import _sarah from '../officerPhotos/2022/sarahThomas.jpg';
import _sirena from '../officerPhotos/2022/sirenaakopyan.jpg';
import _fyr1 from '../officerPhotos/2022/fyr1.jpg';
import _fyr2 from '../officerPhotos/2022/fyr2.jpg';

export const team_2022 = {
    [groupType.OFFICERS]: [
		{
			position: officerPositions.COPRESIDENT,
            name: "Justin Zeng",
            picture: _justin,
            github: 'https://github.com/Once28',
			linkedin: "https://www.linkedin.com/in/justin-zeng-3b7b47165/"
		},
		{
			position: officerPositions.COPRESIDENT,
			name: "Sachi Figliolini",
			picture: _sachi,
            linkedin: "http://www.linkedin.com/in/sachi-figliolini/"
		},
		{
			position: officerPositions.FINANCE,
			name: "Phyllis Chen",
			picture: _phyllis,
			linkedin: "https://www.linkedin.com/in/phyllis-chen-profile"
		},
		{
			position: officerPositions.CREATIVE,
			name: "Sarah Thomas",
			picture: _sarah,
            linkedin: "https://www.linkedin.com/in/sarahetthomas/",
            website: "https://sarahthomas.me"
		},
		{
			position: officerPositions.PUBLIC_RELATIONS,
			name: "Brianna Pak",
            picture: _brianna,
			linkedin: "https://www.linkedin.com/in/briannapak/",
		},
		{
			position: officerPositions.OUTREACH,
			name: "Sirena Akopyan",
			picture: _sirena,
			linkedin: "https://www.linkedin.com/in/sirena-akopyan-61862221a"
		},
		{
			position: officerPositions.DIVERSITY,
			name: "Pranav Shekar",
            picture: _pranav,
            linkedin: "https://www.linkedin.com/in/pranav-shekar/",
            website: "http://pranavshekar.com/"
		},
		{
			position: officerPositions.IT,
			name: "Devina Tavathia",
			picture: _devina,
			linkedin: "https://www.linkedin.com/in/devina-tavathia-40722b167/",
			website: "https://devinat.github.io/PersonalPortfolio/",
			github: "https://github.com/DevinaT"
		},
		{
			position: officerPositions.ACADEMIC,
			name: "Drew Favors",
            picture: _drew,
			linkedin: "https://www.linkedin.com/in/drewfavors"
		}
    ],
    [groupType.FYR]: [
        {
            position: officerPositions.FYR,
            name: "Eric Kim",
			picture: _fyr1,
            socials: {
                linkedin: "https://www.linkedin.com/in/taehyunnkim/",
                github: "https://github.com/taehyunnkim"
            }
        },
        {
            position: officerPositions.FYR,
			name: "Ryan Louie",
			picture: _fyr2,
            socials: {
                linkedin: "https://www.linkedin.com/in/rylouie/",
            }
        },
    ]
}