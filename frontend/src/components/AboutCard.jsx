const AboutCard = ({ member }) => {
    return (
        <div className="aboutCard">
            <img src={member.image} alt={member.name} />
            <div>
                <div>
                    <h3>{member.name}</h3>
                </div>
            </div>
        </div>
    );
};

export default AboutCard;
