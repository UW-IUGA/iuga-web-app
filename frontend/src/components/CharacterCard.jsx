import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGraduationCap, faComment, faBriefcase } from '@fortawesome/free-solid-svg-icons'

import bookIcon from "../assets/icons/icons8-book.gif";
import commentIcon from "../assets/icons/icons8-comment.gif";
import briefcaseIcon from "../assets/icons/icons8-briefcase.gif";

const CharacterCard = ({ category }) => {
    let description = '';
    let icon = '';

    if (category.toLowerCase() === 'academic') {
        // icon = <FontAwesomeIcon icon={faGraduationCap}/>;
        icon = <img src={bookIcon} alt="" />
        description = 'Engage with workshops, study sessions, and guest lectures to enhance your academic journey.';
    } else if (category.toLowerCase() === 'social') {
        // icon = <FontAwesomeIcon icon={faComment}/>;
        icon = <img src={commentIcon} alt="" />
        description = 'Connect with the iSchool community through fun social activities, including game nights, mixers, and cultural events.';
    } else if (category.toLowerCase() === 'career') {
        // icon = <FontAwesomeIcon icon={faBriefcase}/>;
        icon = <img src={briefcaseIcon} alt="" />
        description = 'Prepare for your professional future with our networking events, resume workshops, and industry talks.';
    }

    return (
        <div className={`characterCard ${category.toLowerCase()}`}>
            <img src={`/assets/characters/${category.toLowerCase()}.svg`} alt={`${category} character`}></img>
            <div className={`characterCardBox`}>
                <span className="characterCardBackground"></span>
                <div className="characterCardHeader">
                    <div>{icon}</div>
                    <h1>{category}</h1>
                </div>
                <div className="characterCardBody">
                    <p>{description}</p>
                    {/* <button>{category} Events →</button> */}
                </div>
            </div>
        </div>
    );
};

export default CharacterCard;