import React, { useState, useEffect } from "react";
import Dropdown from "../components/Dropdown";
import GradientLine from "../components/GradientLine";
import AboutCard from "../components/AboutCard";

function AboutPage({ members }) {
    const years = Object.keys(members.memberYears).reverse();
    const [selectedYear, setSelectedYear] = useState(years[0]);
    const [data, setData] = useState(null);
    console.log(data);

    useEffect(() => {
        setData(members.memberYears[selectedYear]);
    }, [selectedYear, members]);

    const handleSelectYear = (year) => {
        setSelectedYear(year);
    };

    const renderTeams = (data) => {
        return Object.keys(data).map((team) => {
            if (team !== "Officers" && data[team].length > 0) {
                return (
                    <div key={team}>
                        <div className="headerPadding">
                            <h2>{team}</h2>
                            <GradientLine className="fullWidth" />
                        </div>
                        <div>
                            {data[team].map((member, index) => (
                                <AboutCard key={`${member.position}-${index}`} member={member} />
                            ))}
                        </div>
                    </div>
                );
            }
            return null;
        });
    };

    return (
        <div className="baseContainer">
            <div className="aboutSum">
                <img className="aboutImg" src="/assets/about-main.png" alt="group of iuga students" />
                <div className="sum">
                    <h1>IUGA History</h1>
                    <p>
                        Long ago, the four nations lived together in harmony. Then, everything changed when the Fire
                        Nation attacked. Only the Avatar, master of all four elements, could stop them, but when the
                        world needed him most, he vanished. A hundred years passed and my brother and I discovered the
                        new Avatar, an airbender named Aang, and although his airbending skills are great, he has a lot
                        to learn before he's ready to save anyone. But I believe Aang can save the world.
                    </p>
                </div>
            </div>
            <div className="aboutContainer">
                <div className="aboutHeader">
                    <h2>Officers</h2>
                    <Dropdown options={years} defaultOption={years[0]} onSelect={handleSelectYear} />
                </div>
                <GradientLine className="fullWidth addedMargin" />
                <div className="aboutWrapper">
                    {data &&
                        data["Officers"] &&
                        data["Officers"].map((member, index) => (
                            <AboutCard key={`${member.position}-${index}`} member={member} />
                        ))}
                </div>
                {data && renderTeams(data)}
            </div>
        </div>
    );
}

export default AboutPage;
