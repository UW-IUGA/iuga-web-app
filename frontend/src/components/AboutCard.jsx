const AboutCard = ({ member }) => {
    return (
        <div className="aboutCard">
            <img src={member.picture} alt={member.name} />
            <div>
                <div>
                    <h3>{member.name}</h3>
                    <p>{member.position}</p>
                </div>
            </div>
        </div>
    );
};

export default AboutCard;
