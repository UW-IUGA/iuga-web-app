import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEnvelope, faGlobe } from '@fortawesome/free-solid-svg-icons'
import { faLinkedin, faGithub } from '@fortawesome/free-brands-svg-icons'

const AboutCard = ({ member }) => {
    return (
        <div className="aboutCard">
            <img src={member.picture} alt={member.name} />
            <div>
                <div>
                    <h3>{member.name}</h3>
                    <p>{member.position}</p>
                </div>
                <div className="about-card-socials">
                    { member.socials && "email" in member.socials && <a className="social-email" href={member.socials.email} target="_blank"><FontAwesomeIcon icon={faEnvelope} /></a>}
                    { member.socials && "linkedin" in member.socials && <a className="social-linkedin" href={member.socials.linkedin} target="_blank"><FontAwesomeIcon icon={faLinkedin} /></a> }
                    { member.socials && "github" in member.socials && <a className="social-github" href={member.socials.github} target="_blank"><FontAwesomeIcon icon={faGithub} /></a> }
                    { member.socials && "website" in member.socials && <a className="social-website" href={member.socials.website} target="_blank"><FontAwesomeIcon icon={faGlobe} /></a> }
                </div>
            </div>  
        </div>
    );
};

export default AboutCard;
