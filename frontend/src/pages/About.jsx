import { useState } from "react";
import StudentProfileCard from "../components/StudentProfileCard";
import { groupType } from "../assets/data/Enum";
import PageHeader from "../components/PageHeader";
import { EntranceGrid, PageRoot } from "../components/PageEntrance";

// Matches .about__teamGrid: 1 column, 2 from tablet, 3 from sm-desktop.
const ABOUT_ENTRANCE_COLUMNS = { 0: 1, 768: 2, 1024: 3 };

function AboutPage({ teams }) {
    const years = Object.keys(teams);
    const [selectedYear, setSelectedYear] = useState(years[years.length - 1]);
    const officers = teams[selectedYear]?.[groupType.OFFICERS] ?? [];

    return (
        <div className="baseContainer">
            <PageRoot className="about" onceKey="about">
                <PageHeader
                    title="Meet the students behind IUGA."
                    intro="IUGA is a student-led association run by Informatics undergraduates, for Informatics undergraduates."
                />

                <section className="about__section" aria-labelledby="about-team-heading">
                    <h2 id="about-team-heading">{selectedYear} team</h2>
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
                        <EntranceGrid columns={ABOUT_ENTRANCE_COLUMNS}>
                        {officers.map((member, index) => (
                            <StudentProfileCard
                                key={`${member.position}-${index}`}
                                profile={member}
                            />
                        ))}
                        </EntranceGrid>
                    </div>
                </section>
            </PageRoot>
        </div>
    );
}

export default AboutPage;
