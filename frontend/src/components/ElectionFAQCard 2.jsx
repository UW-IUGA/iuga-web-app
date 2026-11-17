const ElectionFAQCard = ({ electionFAQ }) => {
    return (
        <div className="electionfaqBox">
            <div className="electionfaqContent">
                <h3>{electionFAQ.rName}</h3>
                <p>{electionFAQ.rDescription}</p>
            </div>
        </div>
    );
};

export default ElectionFAQCard;
