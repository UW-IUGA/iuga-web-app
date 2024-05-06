import Button from "./Button";

const ResourceCard = () => {
    return (
        <div className="resourceBox">
            <div className="resourceIcon">
                <img src="/assets/resource-iuga-icon.svg" alt="iuga icon" />
            </div>
            <div className="resourceContent">
                <h3>Informatics Undergraduate Association</h3>
                <p>
                    IUGA is a student-led RSO that communicates between the
                    Informatics student body, faculty, and administration of the
                    University of Washington Information School. We host fun,
                    community building events as well as events for professional
                    development.
                </p>
                <Button
                    text="Learn More"
                    className="primary-button"
                    type="right-arrow"
                    color="black"
                />
            </div>
        </div>
    );
};

export default ResourceCard;
