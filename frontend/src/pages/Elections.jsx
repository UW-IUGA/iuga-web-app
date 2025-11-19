import React, { useState, useEffect, useMemo } from "react";
import Dropdown from "../components/Dropdown";
import RolePage from "../components/RolePage";
import { candidatePositions } from "../assets/data/Enum";
import Button from "../components/Button";

function ElectionPage({ candidates }) {
  const years = useMemo(() => Object.keys(candidates).sort().reverse(), [candidates]);
  const [selectedYear, setSelectedYear] = useState(years[0]);
  const [data, setData] = useState(null);
  const [selectedRole, setSelectedRole] = useState("President");

  useEffect(() => {
    setData(candidates[selectedYear]);
  }, [selectedYear, candidates]);

  const handleSelectYear = (year) => setSelectedYear(year);
  const handleRoleChange = (role) => setSelectedRole(role);

  // only show categories when the selected year actually has candidates
  const hasAnyCandidates = Array.isArray(data) && data.length > 0;

  return (
    <div className="baseContainer">
      <div className="electionContainer">
        <div className="electionHeader">
          <div className="electionImgContainer">
            <img className="electionImg" src="/assets/elections.png" alt="iuga student casting ballot" />
          </div>
          <div className="electionSummary">
            <h1>Welcome to IUGA Elections</h1>
            <p>{hasAnyCandidates ? "Meet the candidates!" : "There are no active elections right now."}</p>
          </div>
          {/* future implementation: show a vote button only when there’s an active election */}
          {/* {hasAnyCandidates && <Button ... />} */}
        </div>
      </div>

      {}
      <div className="candidateHeader">
        <h2>{hasAnyCandidates ? "Candidates" : "Archive"}</h2>
        <Dropdown options={years} defaultOption={years[0]} onSelect={handleSelectYear} />
      </div>

      {}
      {hasAnyCandidates && (
        <div className="electionContentContainer">
          <div className="roleSidebar">
            <h2>Select a Position</h2>
            {Object.entries(candidatePositions).map(([key, roleName]) => (
              <div
                key={key}
                className={`roleItem ${roleName === selectedRole ? "active" : ""}`}
                onClick={() => handleRoleChange(roleName)}
              >
                {roleName}
              </div>
            ))}
          </div>

          <div className="electionContent">
            <div className="roleTitle">
              <h1>{selectedRole}</h1>
            </div>
            <p>Click a candidate name to learn more about them!</p>
            <div className="rolePage">
              <RolePage role={selectedRole} year={selectedYear} candidates={data} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ElectionPage;
