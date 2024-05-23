import React, { useState, useEffect } from "react";
import Dropdown from "../components/Dropdown";
import GradientLine from "../components/GradientLine";
import AboutCard from "../components/AboutCard";
import ResourceCard from "../components/ResourceCard";

function AboutPage({ groupType, members }) {
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
                {Object.entries(groupType).map(([key, value]) => (
                    <React.Fragment key={key}>
                        <div className="headerDropdown">
                            <h2>{value}</h2>
                            {key === "OFFICERS" && (
                                <Dropdown options={years} defaultOption={years[0]} onSelect={handleSelectYear} />
                            )}
                        </div>
                        <GradientLine className="fullWidth" />
                        {data &&
                            data[key] &&
                            data[key].map((member, index) => (
                                <AboutCard key={`${member.position}-${index}`} member={member} />
                            ))}
                    </React.Fragment>
                ))}
                <h2>Affiliated RSOs</h2>
                <GradientLine className="fullWidth" />
                {members.rsos.map((rso, index) => (
                    <ResourceCard key={index} resource={rso} />
                ))}
            </div>
        </div>
    );
}

export default AboutPage;
