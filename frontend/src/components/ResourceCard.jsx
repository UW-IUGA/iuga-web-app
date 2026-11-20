/*
Purpose: One resource in the Resources page grid.

Expected Request Information:
- resource: a tagged resource { rName, rDescription, rLink, rImage, tags, highlights }.
- highlight: the search pattern from useResourceFilters, or null.

Expected Response Information:
- A card with the resource's tags, name, and bullets (or its description when it has no bullets yet), and a link
  to the resource when it has one.
*/

import HighlightMatch from "./HighlightMatch";

function ResourceCard({ resource, highlight }) {
    return (
        <article className="resourceCard editorial-card">
            <div className="resourceIcon">
                {resource.rImage ? (
                    <img src={resource.rImage} alt={`${resource.rName} icon`} />
                ) : (
                    <span aria-label={`${resource.rName} icon unavailable`}>{resource.rName.charAt(0)}</span>
                )}
            </div>
            <div className="resourceCard__content">
                <p className="resourceCard__category">
                    <HighlightMatch text={resource.tags.join(" · ")} pattern={highlight} />
                </p>
                <h3><HighlightMatch text={resource.rName} pattern={highlight} /></h3>
                {resource.highlights.length > 0 ? (
                    <ul className="resourceCard__highlights">
                        {resource.highlights.map((text) => (
                            <li key={text}><HighlightMatch text={text} pattern={highlight} /></li>
                        ))}
                    </ul>
                ) : (
                    <p><HighlightMatch text={resource.rDescription} pattern={highlight} /></p>
                )}
                {resource.rLink ? (
                    <a
                        className="pill-button resourceCard__link"
                        href={resource.rLink}
                        target="_blank"
                        rel="noreferrer"
                    >
                        More Info
                        <span className="sr-only"> about {resource.rName} (opens in a new tab)</span>
                    </a>
                ) : (
                    <span className="resourceCard__pending">Details coming soon</span>
                )}
            </div>
        </article>
    );
}

export default ResourceCard;
