import { useState } from "react";
import GetInvolvedMemberCard from "../components/GetInvolvedMemberCard";
import { groupType } from "../assets/data/Enum";

function AboutPage({ teams }) {
    const years = Object.keys(teams);
    const [selectedYear, setSelectedYear] = useState(years[years.length - 1]);
    const officers = teams[selectedYear]?.[groupType.OFFICERS] ?? [];

    return (
        <div className="baseContainer">
            <main className="about">
                <section className="about__summary">
                    <div className="about__summaryText">
                        <h1>About Us</h1>
                        <p>
                            IUGA is a student-led organization run by Informatics undergraduates, for Informatics
                            undergraduates. We create space for students to connect, build community, and shape the iSchool experience.
                        </p>
                    </div>
                </section>

                <section className="about__section" aria-labelledby="team-heading">
                    <div className="about__header">
                        <p className="about__kicker">Team</p>
                        <h2 id="team-heading">Meet the {selectedYear} Team</h2>
                    </div>
                    <div className="about__yearFilter" role="group" aria-label="Team year">
                        {years.map((year) => (
                            <button
                                key={year}
                                type="button"
                                className="pill-button"
                                aria-pressed={selectedYear === year}
                                onClick={() => setSelectedYear(year)}
                            >
                                {year}
                            </button>
                        ))}
                    </div>
                    <div className="about__teamGrid">
                        {officers.map((member, index) => (
                            <GetInvolvedMemberCard key={`${member.position}-${index}`} member={member} />
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
}

export default AboutPage;
