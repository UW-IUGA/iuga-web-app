import HighlightMatch from "./HighlightMatch";

// Bullet highlights stand in for the description; a resource without them yet shows its full description.
const ResourceCard = ({ resource, highlight }) => {
    return (
        <article className="resourceCard editorial-card">
            <div className="resourceCardIcon">
                {resource.rImage ? (
                    <img src={resource.rImage} alt={`${resource.rName} icon`} />
                ) : (
                    <span aria-label={`${resource.rName} icon unavailable`}>{resource.rName.charAt(0)}</span>
                )}
            </div>
            <div className="resourceCardContent">
                <p className="resourceCardCategory"><HighlightMatch text={resource.tags.join(" · ")} pattern={highlight} /></p>
                <h3><HighlightMatch text={resource.rName} pattern={highlight} /></h3>
                {resource.highlights.length > 0 ? (
                    <ul className="resourceHighlights">
                        {resource.highlights.map((text) => (
                            <li key={text}><HighlightMatch text={text} pattern={highlight} /></li>
                        ))}
                    </ul>
                ) : (
                    <p><HighlightMatch text={resource.rDescription} pattern={highlight} /></p>
                )}
                {resource.rLink ? (
                    <a className="pill-button resourceCardLink" href={resource.rLink} target="_blank" rel="noreferrer">
                        More Info
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
