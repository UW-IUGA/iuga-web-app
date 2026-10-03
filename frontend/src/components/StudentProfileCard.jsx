/*
Purpose: Display a student's portrait, role, name, and public profile links.
Authentication/Authorization Requirements: Public information; no authentication is required.
Expected Request Information: A profile with a name, position, and optional picture and socials.
Expected Response Information: An accessible portrait card with available profile links.
*/
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGlobe, faUser } from "@fortawesome/free-solid-svg-icons";
import { faLinkedin, faGithub } from "@fortawesome/free-brands-svg-icons";

const StudentProfileCard = ({ profile }) => {
    const { name, position, picture, socials } = profile;

    return (
        <article className="studentProfileCard">
            <div className="studentProfileCard__media">
                {picture ? (
                    <img src={picture} alt={name} />
                ) : (
                    <span className="studentProfileCard__placeholder" aria-label={`${name} photo unavailable`}>
                        <FontAwesomeIcon icon={faUser} aria-hidden="true" />
                    </span>
                )}
                <div className="studentProfileCard__body">
                    <div className="studentProfileCard__identity">
                        <p className="studentProfileCard__position">{position}</p>
                        <h3>{name}</h3>
                    </div>
                    {socials && (
                        <div className="studentProfileCard__socials" role="group" aria-label={`${name} social links`}>
                            {"website" in socials && (
                                <a className="social-website" href={socials.website} target="_blank" rel="noreferrer" aria-label={`${name} website`}>
                                    <FontAwesomeIcon icon={faGlobe} aria-hidden="true" />
                                </a>
                            )}
                            {"github" in socials && (
                                <a className="social-github" href={socials.github} target="_blank" rel="noreferrer" aria-label={`${name} GitHub`}>
                                    <FontAwesomeIcon icon={faGithub} aria-hidden="true" />
                                </a>
                            )}
                            {"linkedin" in socials && (
                                <a className="social-linkedin" href={socials.linkedin} target="_blank" rel="noreferrer" aria-label={`${name} LinkedIn`}>
                                    <FontAwesomeIcon icon={faLinkedin} aria-hidden="true" />
                                </a>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </article>
    );
};

export default StudentProfileCard;
