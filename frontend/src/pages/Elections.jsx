import React, { useState, useEffect } from "react";
import Dropdown from "../components/Dropdown";
import GradientLine from "../components/GradientLine";
import RolePage from "../components/RolePage";
import { candidatePositions } from "../assets/data/Enum";
import Button from "../components/Button";

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
                <div className="blob3"></div> */}
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
