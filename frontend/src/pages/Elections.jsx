import React, { useState, useEffect, useMemo } from "react";
import Dropdown from "../components/Dropdown";
import RolePage from "../components/RolePage";
import { candidatePositions } from "../assets/data/Enum";
import Button from "../components/Button";
import { electionsMeta } from "../assets/data/elections/meta";

function ElectionPage({ candidates }) {
  // Build years from union of data + meta so inactive years still appear
  const years = useMemo(() => {
    const set = new Set([
      ...Object.keys(candidates || {}),
      ...Object.keys(electionsMeta || {})
    ]);
    return Array.from(set).sort().reverse();
  }, [candidates]);

  // pick newest year by default (e.g., 2026)
  const [selectedYear, setSelectedYear] = useState(years[0]);
  const [data, setData] = useState(null);

  const pickFirstRoleWithCandidates = (yearData) => {
    for (const key of Object.keys(candidatePositions)) {
      const roleName = candidatePositions[key];
      if (yearData?.[roleName]?.length) return roleName;
    }
    return candidatePositions.PRESIDENT || "President";
  };

  const [selectedRole, setSelectedRole] = useState("President");

  useEffect(() => {
    const yearData = candidates[selectedYear];
    setData(yearData || null);
    setSelectedRole(pickFirstRoleWithCandidates(yearData));
  }, [selectedYear, candidates]);

  const handleSelectYear = (year) => setSelectedYear(year);
  const handleRoleChange = (role) => setSelectedRole(role);

  const meta = electionsMeta[selectedYear] || {
    active: false,
    title: "IUGA Elections",
    blurb: "There are no elections at this time. Check back later!",
    voteLink: null,
    heroImg: "/assets/elections.png",
  };

  const hasAnyCandidates = useMemo(() => {
    const yr = candidates[selectedYear];
    if (!yr) return false;
    return Object.values(yr).some((arr) => Array.isArray(arr) && arr.length > 0);
  }, [candidates, selectedYear]);

  const isActive = Boolean(meta.active && hasAnyCandidates);

  return (
    <div className="baseContainer">
      <div className="electionContainer">
        <div className="electionHeader">
          <div className="electionImgContainer">
            <img className="electionImg" src={meta.heroImg || "/assets/elections.png"} alt="IUGA elections" />
          </div>
          <div className="electionSummary">
            <h1>{meta.title}</h1>
            <p>{meta.blurb}</p>
          </div>
          {isActive && meta.voteLink ? (
            <Button
              text="Vote Here!"
              link={meta.voteLink}
              className="primary-button"
              type="right-arrow"
              onClick={() => window.open(meta.voteLink, "_blank")}
            />
          ) : null}
        </div>
      </div>

      <div className="candidateHeader">
        <h2>{isActive ? "Candidates" : "Archive"}</h2>
        <Dropdown options={years} defaultOption={years[0]} onSelect={handleSelectYear} />
      </div>

      {isActive ? (
        <div className="electionContentContainer">
          <div className="roleSidebar">
            <h2>Select a Position</h2>
            {Object.entries(candidatePositions).map(([key, roleName]) => {
              const count = data?.[roleName]?.length || 0;
              const disabled = count === 0;
              return (
                <div
                  key={key}
                  className={`roleItem ${roleName === selectedRole ? "active" : ""} ${disabled ? "disabled" : ""}`}
                  onClick={() => !disabled && handleRoleChange(roleName)}
                  title={disabled ? "No candidates" : undefined}
                >
                  {roleName}
                </div>
              );
            })}
          </div>

          <div className="electionContent">
            <div className="roleTitle">
              <h1>{selectedRole}</h1>
            </div>
            <p>Click a candidate name to learn more about them!</p>
            <div className="rolePage">
              <RolePage role={selectedRole} year={selectedYear} />
            </div>
          </div>
        </div>
      ) : (
        <div className="electionContentContainer">
          <div className="electionContent" style={{ width: "100%" }}>
            <div className="roleTitle">
              <h1>No Active Elections</h1>
            </div>
            <p>
              There are no elections running for {selectedYear}. Use the dropdown above to browse past candidate slates.
            </p>

            {/* Optional “archive preview” if that year *does* have data */}
            {hasAnyCandidates && (
              <>
                <h3 style={{ marginTop: 24 }}>Candidate Archive for {selectedYear}</h3>
                <p>Select a position to view candidates from that cycle.</p>
                <div className="roleSidebar" style={{ marginTop: 8 }}>
                  {Object.entries(candidatePositions).map(([key, roleName]) => {
                    const count = data?.[roleName]?.length || 0;
                    const disabled = count === 0;
                    return (
                      <div
                        key={key}
                        className={`roleItem ${roleName === selectedRole ? "active" : ""} ${disabled ? "disabled" : ""}`}
                        onClick={() => !disabled && handleRoleChange(roleName)}
                        title={disabled ? "No candidates" : undefined}
                      >
                        {roleName}
                      </div>
                    );
                  })}
                </div>
                <div className="rolePage" style={{ marginTop: 12 }}>
                  <RolePage role={selectedRole} year={selectedYear} />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ElectionPage;



/*
function ElectionPage({ candidates }) {

    const [selectedRole, setSelectedRole] = useState("President");

    const handleRoleChange = (role) => {
        setSelectedRole(role);
    };

    const years = Object.keys(candidates).reverse();
    const [selectedYear, setSelectedYear] = useState(years[0]);
    const [data, setData] = useState(null);

    useEffect(() => {
        setData(candidates[selectedYear]);
    }, [selectedYear, candidates]);

    const handleSelectYear = (year) => {
        setSelectedYear(year);
    };

    return (
        <div className="baseContainer">
            <div className="electionContainer">
                {/* <div className="blob1"></div>
                <div className="blob2"></div>
                <div className="blob3"></div> }
                <div className="electionHeader">
                    <div className="electionImgContainer">
                        <img className="electionImg" src="/assets/elections.png" alt="iuga student casting ballot" />
                    </div>
                    <div className="electionSummary">
                        <h1>Welcome to IUGA 2024-25 Elections!</h1>
                        <p> Meet your 2024-25 Candidates. Don't forget to vote by February 28th!</p>
                    </div>
                    <Button text="Vote Here!" link="https://forms.office.com/pages/responsepage.aspx?id=W9229i_wGkSZoBYqxQYL0pj2PffrcZlMvNzx2DvLiVNUN0FIMk1UR01aRE1FWkVNMzAzT1lDUDBRMi4u&route=shorturl" className="primary-button" type="right-arrow" onClick={() => {window.open()}} />
                </div>
            </div>
            <div className="candidateHeader">
                <h2>Candidates</h2>
                <Dropdown options={years} defaultOption={years[0]} onSelect={handleSelectYear} />
            </div>
            <div className="electionContentContainer">
                <div className="roleSidebar">
                    <h2>Select a Position</h2>
                    {Object.entries(candidatePositions).map(([key, roleName]) => (
                        <div
                            key={key}
                            className={`roleItem ${roleName === selectedRole ? 'active' : ''}`}
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
                        <RolePage role={selectedRole} year={selectedYear} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ElectionPage;
*/