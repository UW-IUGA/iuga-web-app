import React, { useState, useEffect } from "react";
import Dropdown from "../components/Dropdown";
import GradientLine from "../components/GradientLine";
import AboutCard from "../components/AboutCard";
import MediaQuery from "react-responsive";

function AboutPage({ teams }) {
    const years = Object.keys(teams).reverse();
    const [selectedYear, setSelectedYear] = useState(years[0]);
    const [data, setData] = useState(null);

    useEffect(() => {
        setData(teams[selectedYear]);
    }, [selectedYear, teams]);

    const handleSelectYear = (year) => {
        setSelectedYear(year);
    };

    const renderTeams = (data) => {
        return Object.keys(data).map((team) => {
            if (team !== "Officers" && data[team].length > 0) {
                return (
                    <div key={team}>
                        <div className="aboutHeader">
                            <h2>{team}</h2>
                        </div>
                        <div className="aboutWrapper">
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
        <>
        <MediaQuery minWidth={340} maxWidth={1023}>
            <div className="constructionContainer">
                <p>🚧 The Mobile About Page is Under Construction! 🚧</p>
                <p>🚧 Please use your PC to access this page. 🚧</p>
                <img src="/assets/about-main.png" alt="group of iuga students" />
            </div>
        </MediaQuery>
        <MediaQuery minWidth={1024}>
            <div className="baseContainer">
                <div className="aboutSummaryContainer">
                    <img className="aboutImg" src="/assets/about-main.png" alt="group of iuga students" />
                    <div className="aboutSummary">
                        <h1>IUGA History</h1>
                        <p>
                            Ever since the Informatics major has existed, we’ve had passionate, motivated student leaders to help establish the iSchool community for undergraduate students. From management, software development, and design, our officers old and new bring diverse experiences and skillsets to the IUGA executive board table. 
                            <br /><br />
                            Want to contribute to the Informatics community? Elections for officers are held mid-winter quarter, and all are encouraged to apply! Explore our current and past officers to understand which student leaders work with the iSchool, and feel free to reach out to any of them with questions!
                        </p>
                    </div>
                </div>
                <div className="aboutContainer">
                    <div className="aboutHeader">
                        <h2>Officers</h2>
                        <Dropdown options={years} defaultOption={years[0]} onSelect={handleSelectYear} />
                    </div>
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
        </MediaQuery>
        </>
    );
}

export default AboutPage;
