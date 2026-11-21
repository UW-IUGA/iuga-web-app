import { resourceTagTones } from "../assets/data/Enum";

const ResourceCard = ({ resource, category }) => {
    return (
        <article className="resourceCard editorial-card">
            <div className={`resourceCardIcon${resource.rImageInset ? " resourceCardIcon--inset" : ""}`}>
                {resource.rImage ? (
                    <img src={resource.rImage} alt={`${resource.rName} icon`} />
                ) : (
                    <span aria-label={`${resource.rName} icon unavailable`}>{resource.rName.charAt(0)}</span>
                )}
            </div>
            <div className="resourceCardContent">
                <h3>{resource.rName}</h3>
                <p>{resource.rDescription}</p>
                {resource.rLink ? (
                    <a className="pill-button pill-button--fill resourceCardLink" data-tone={resourceTagTones[category]} href={resource.rLink} target="_blank" rel="noreferrer">
                        Learn more
                        <span className="sr-only"> about {resource.rName} (opens in a new tab)</span>
                    </a>
                ) : (
                    <span className="resourceCardPending">Details coming soon</span>
                )}
            </div>
        </article>
    );
};

export default ResourceCard;
