const ResourceCard = ({ resource, category }) => {
    return (
        <article className="resourceCard">
            <div className="resourceCardIcon">
                {resource.rImage ? (
                    <img src={resource.rImage} alt={`${resource.rName} icon`} />
                ) : (
                    <span aria-label={`${resource.rName} icon unavailable`}>{resource.rName.charAt(0)}</span>
                )}
            </div>
            <div className="resourceCardContent">
                <p className="resourceCardCategory">{category}</p>
                <h3>{resource.rName}</h3>
                <p>{resource.rDescription}</p>
                {resource.rLink ? (
                    <a className="cta-primary resourceCardLink" href={resource.rLink} target="_blank" rel="noreferrer">
                        Visit resource
                        <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                ) : (
                    <span className="resourceCardPending">Details coming soon</span>
                )}
            </div>
        </article>
    );
};

export default ResourceCard;
