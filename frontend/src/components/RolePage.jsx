import { useState } from "react";
import { iugaCandidates } from "../assets/data/CandidateData";

const CandidatePage = ({ candidate }) => {
    if (!candidate) {
        return <div>Candidate data not available</div>
    }
    return (
        <div className="candidatePage">
            <div className="img-name-container">
                <div className="candidateImage">
                    <img src={candidate.picture} alt={candidate.name} />
                </div>
                <div className="space">
                </div>
                <div className="candidateName">
                    <h2>{candidate.name}</h2>
                </div>
            </div>
            <div className="aboutMe">
                <h3>About Me</h3>
                <p>{candidate.blurb}</p>
            </div> 
            <div className="media">
            <iframe title="Candidate Media File" src={candidate.media}></iframe>
            </div>
        </div>
    );
};

const RolePage = ({ role, year }) => {

    const candidates = iugaCandidates[year] || [];

    const filteredCandidates = candidates.filter((candidate) => {
        const candidateRole = candidate.position.toLowerCase();
        const selectedRole = role.toLowerCase();

    console.log(`Checking ${candidate.name}: ${candidateRole} === ${selectedRole}`);
        
    return candidateRole === selectedRole;
    });
    
    const [activeTab, setActiveTab] = useState(filteredCandidates[0]? `${filteredCandidates[0].name}-${filteredCandidates[0].position}` : null);

    const handleTabClick = (candidate) => {
        const key = `${candidate.name}-${candidate.position}`;
        setActiveTab(key)
    };

    return (
        <div className="rolePage">
            <div className="all-tabs">
                {filteredCandidates.length === 0 ? (
                        <p>There are no candidates running for this position.</p>
                    ) : (
                    filteredCandidates.map((candidate) => {
                        const key = `${candidate.name}-${candidate.position}`;
                        return (
                            <div
                                key={key}
                                className={`tab ${key === activeTab ? `active` : ''}`}
                                onClick={() => handleTabClick(candidate)}
                            >
                                {candidate.name}
                            </div>
                        );
                    })
                )}
            </div>
            <div className="candidate-info">
                {filteredCandidates.map((candidate) => {
                    const key = `${candidate.name}-${candidate.position}`;
                    return key === activeTab ? (
                        <CandidatePage key={key} candidate={candidate} />
                    ) : null;
                })}
            </div>
        </div>
    );
};

export default RolePage;
