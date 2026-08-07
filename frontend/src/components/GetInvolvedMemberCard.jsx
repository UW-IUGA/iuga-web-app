import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faGlobe, faUser } from "@fortawesome/free-solid-svg-icons";
import { faLinkedin, faGithub } from "@fortawesome/free-brands-svg-icons";

// Roster cards never carry a committee join CTA — those live in the committee section.
const GetInvolvedMemberCard = ({ member }) => {
    const { name, position, picture, socials } = member;

    return (
        <article className="getInvolvedCard editorial-card">
            <div className="getInvolvedCard__media">
                {picture ? (
                    <img src={picture} alt={name} />
                ) : (
                    <span className="getInvolvedCard__placeholder" aria-label={`${name} photo unavailable`}>
                        <FontAwesomeIcon icon={faUser} aria-hidden="true" />
                    </span>
                )}
            </div>
            <div className="getInvolvedCard__body">
                <h3>{name}</h3>
                <p className="getInvolvedCard__position">{position}</p>
                {socials && (
                    <div className="getInvolvedCard__socials">
                        {"email" in socials && (
                            <a className="social-email" href={socials.email} target="_blank" rel="noreferrer" aria-label={`${name} email`}>
                                <FontAwesomeIcon icon={faEnvelope} aria-hidden="true" />
                            </a>
                        )}
                        {"linkedin" in socials && (
                            <a className="social-linkedin" href={socials.linkedin} target="_blank" rel="noreferrer" aria-label={`${name} LinkedIn`}>
                                <FontAwesomeIcon icon={faLinkedin} aria-hidden="true" />
                            </a>
                        )}
                        {"github" in socials && (
                            <a className="social-github" href={socials.github} target="_blank" rel="noreferrer" aria-label={`${name} GitHub`}>
                                <FontAwesomeIcon icon={faGithub} aria-hidden="true" />
                            </a>
                        )}
                        {"website" in socials && (
                            <a className="social-website" href={socials.website} target="_blank" rel="noreferrer" aria-label={`${name} website`}>
                                <FontAwesomeIcon icon={faGlobe} aria-hidden="true" />
                            </a>
                        )}
                    </div>
                )}
            </div>
        </article>
    );
};

export default GetInvolvedMemberCard;
