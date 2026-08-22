const IUGA_EMAIL = "iuga@uw.edu";

const mailto = (subject, body) =>
    `mailto:${IUGA_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

const COMMITTEES = [
    {
        name: "IT Committee",
        ledBy: "Yonie Rivera",
        description:
            "Keeps IUGA's digital presence running: the website, internal tooling, and the technical infrastructure behind our events and outreach.",
        mailto: mailto(
            "Joining the IT Committee",
            "Hi IUGA,\n\nI'm an Informatics student and I'd love to join the IT Committee. Please add me to the loop!\n\nThanks,\n[Your name]"
        ),
    },
    {
        name: "Creative Committee",
        ledBy: "Ellie Marsh",
        description:
            "Shapes IUGA's visual identity: event branding, social graphics, and the posters and flyers you see across the iSchool.",
        mailto: mailto(
            "Joining the Creative Committee",
            "Hi IUGA,\n\nI'm an Informatics student and I'd love to join the Creative Committee. Please add me to the loop!\n\nThanks,\n[Your name]"
        ),
    },
    {
        name: "Diversity Committee",
        ledBy: "Nitya Shankar",
        description:
            "Leads events and initiatives that strengthen diversity across the iSchool, partnering with diversity-focused student organizations to build meaningful community.",
        mailto: mailto(
            "Joining the Diversity Committee",
            "Hi IUGA,\n\nI'm an Informatics student and I'd love to join the Diversity Committee. Please add me to the loop!\n\nThanks,\n[Your name]"
        ),
    },
];

function GetInvolvedPage() {
    return (
        <div className="baseContainer">
            <main className="getInvolved">
                <div className="getInvolved__summary">
                    <div className="getInvolved__summaryText">
                        <h1>Get Involved</h1>
                        <p>
                            IUGA is a student-led organization run by Informatics undergraduates, for Informatics
                            undergraduates. The best way to shape the community is to jump in: join a committee,
                            lend a hand at an event, or pitch the next idea worth doing.
                        </p>
                    </div>
                </div>

                <div className="getInvolved__committees">
                    <div className="getInvolved__header">
                        <p className="getInvolved__kicker">Committees</p>
                        <h2>Committee Opportunities</h2>
                    </div>
                    <div className="getInvolved__committeeGrid">
                        {COMMITTEES.map((committee) => (
                            <article className="getInvolvedCommittee editorial-card" key={committee.name}>
                                <h3>{committee.name}</h3>
                                <p className="getInvolvedCommittee__ledBy">Led by {committee.ledBy}</p>
                                <span className="getInvolvedCommittee__badge">Membership Open</span>
                                <p className="getInvolvedCommittee__description">{committee.description}</p>
                                <a className="pill-button" href={committee.mailto}>
                                    Join {committee.name}
                                </a>
                            </article>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}

export default GetInvolvedPage;
