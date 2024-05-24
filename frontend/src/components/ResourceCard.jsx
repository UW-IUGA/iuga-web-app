import Button from "./Button";

const ResourceCard = ({ resource }) => {
    return (
        <div className="resourceBox">
            <img className="resourceIcon" src={resource.rImage} alt={`${resource.rName} icon`} />
            <div className="resourceContent">
                <h3>{resource.rName}</h3>
                <p>{resource.rDescription}</p>
                <Button text="Learn More" className="primary-button" type="right-arrow" onClick={() => {window.open(resource.rLink)}} />
            </div>
        </div>
    );
};

export default ResourceCard;
