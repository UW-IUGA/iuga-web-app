import Button from "./Button";

const ResourceCard = ({ resource }) => {
    return (
        <div className="resourceBox">
            <div className="resourceIcon">
                <img src="/assets/resource-iuga-icon.svg" alt="iuga icon" />
            </div>
            <div className="resourceContent">
                <h3>{resource.rName}</h3>
                <p>{resource.rDescription}</p>
                <Button text="Learn More" className="primary-button" type="right-arrow" color="black" link="#" />
            </div>
        </div>
    );
};

export default ResourceCard;
