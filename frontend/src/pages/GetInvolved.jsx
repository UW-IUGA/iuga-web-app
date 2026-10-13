import { useEffect, useState } from "react";
import { groupType } from "../assets/data/Enum";
import { team_2026 } from "../assets/data/teams/2026";
import EmailContactDialog from "../components/EmailContactDialog";
import StudentProfileCard from "../components/StudentProfileCard";

const committeeLeaders = team_2026[groupType.OFFICERS];
const getCommitteeLeader = (name) => committeeLeaders.find((leader) => leader.name === name);
const fallbackContactEmail = "iuga@uw.edu";
const committeeLeaderEmails = {
    "Yonie Rivera": "yirivera@uw.edu",
    "Ellie Marsh": "emarsh27@uw.edu",
    "Nitya Shankar": "nityas29@uw.edu",
};

const leaderProfiles = [
    { profile: getCommitteeLeader("Ellie Marsh"), isFeatured: true },
    { profile: getCommitteeLeader("Yonie Rivera") },
    { profile: getCommitteeLeader("Nitya Shankar") },
];

const getContactDraft = (committee) => {
    const directRecipient = committeeLeaderEmails[committee.leader.name];
    const recipient = directRecipient ?? fallbackContactEmail;
    const body = directRecipient
        ? `Hi ${committee.leader.name},\n\nI'd like to learn about joining the ${committee.name} and how I can get involved.\n\nThanks,\n[Your name]`
        : `Hi IUGA,\n\nI'd like to learn about joining the ${committee.name}. Please connect me with ${committee.leader.name}.\n\nThanks,\n[Your name]`;

    return {
        recipient,
        subject: `Interested in joining the ${committee.name}`,
        body,
    };
};

const committees = [
    {
        name: "IT Committee",
        leader: getCommitteeLeader("Yonie Rivera"),
        description:
            "The IT Committee maintains the IUGA website so Informatics students can find resources and discover events that interest them. It supports the iStartup Lab and helps grow entrepreneurship and innovation in the Informatics community.",
    },
    {
        name: "Creative Committee",
        leader: getCommitteeLeader("Ellie Marsh"),
        description:
            "Creates event branding, social posts, posters, and flyers for IUGA, and designs merchandise for Informatics undergraduate students.",
    },
    {
        name: "Diversity Committee",
        leader: getCommitteeLeader("Nitya Shankar"),
        description: "Leads events and projects with student groups supporting diversity at the iSchool.",
    },
];

const creativeApplicationDeadlineFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
});

function GetInvolvedPage() {
    const [creativeApplication, setCreativeApplication] = useState(null);

    useEffect(() => {
        let isCurrent = true;
        let closeTimer;

        const loadCreativeApplication = async () => {
            try {
                const response = await fetch("/api/v1/recruitment/creative", { cache: "no-store" });

                if (!response.ok) {
                    throw new Error(`Creative application status request failed: ${response.status}`);
                }

                const result = await response.json();
                const application = result?.application;

                if (
                    result?.status !== "success" ||
                    application?.isOpen !== true ||
                    typeof application.formUrl !== "string" ||
                    typeof application.closesAt !== "string"
                ) {
                    return;
                }

                const formUrl = new URL(application.formUrl);
                const closesAt = new Date(application.closesAt);
                const timeUntilClose = closesAt.getTime() - Date.now();

                if (formUrl.protocol !== "https:" || !Number.isFinite(timeUntilClose) || timeUntilClose <= 0) {
                    return;
                }

                if (!isCurrent) {
                    return;
                }

                setCreativeApplication({ formUrl: formUrl.href, closesAt: closesAt.toISOString() });
                closeTimer = window.setTimeout(() => {
                    if (isCurrent) {
                        setCreativeApplication(null);
                    }
                }, timeUntilClose);
            } catch (error) {
                if (isCurrent) {
                    console.error("Unable to load Creative Committee application status; keeping Contact available.", error);
                }
            }
        };

        loadCreativeApplication();

        return () => {
            isCurrent = false;
            if (closeTimer !== undefined) {
                window.clearTimeout(closeTimer);
            }
        };
    }, []);

    return (
        <div className="baseContainer">
            <main className="getInvolved">
                <header className="getInvolved__hero">
                    <div className="getInvolved__intro">
                        <p className="getInvolved__introLabel">Get involved</p>
                        <h1 className="getInvolved__title">Make your mark at IUGA</h1>
                        <p className="getInvolved__introDescription">
                            Join a student-led committee and help shape what happens in the Informatics community.
                        </p>
                    </div>
                    <div className="getInvolved__leaderProfileGrid" role="group" aria-label="Committee lead profiles">
                        {leaderProfiles.map(({ profile, isFeatured }) => (
                            <div
                                className={`getInvolved__leaderProfile${isFeatured ? " getInvolved__leaderProfile--featured" : ""}`}
                                key={profile.name}
                            >
                                <StudentProfileCard profile={profile} />
                            </div>
                        ))}
                    </div>
                </header>

                <section className="getInvolved__committees" aria-labelledby="getInvolved-committees-heading">
                    <div className="getInvolved__header">
                        <h2 id="getInvolved-committees-heading">Find your way to contribute</h2>
                   </div>
                    <div className="getInvolved__committeeList">
                        {committees.map((committee) => {
                            const hasCreativeApplication =
                                committee.name === "Creative Committee" && creativeApplication !== null;

                            return (
                                <article className="getInvolved__committee" key={committee.name}>
                                    <div className="getInvolved__committeeTitle">
                                        <h3>{committee.name}</h3>
                                        <p>Led by {committee.leader.name}</p>
                                    </div>
                                    <p className="getInvolved__description">{committee.description}</p>
                                    <div
                                        className={
                                            hasCreativeApplication
                                                ? "getInvolved__contactCell getInvolved__contactCell--application"
                                                : "getInvolved__contactCell"
                                        }
                                    >
                                        {hasCreativeApplication ? (
                                            <>
                                                <a
                                                    className="emailContactDialog__trigger getInvolved__apply"
                                                    href={creativeApplication.formUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    Apply
                                                </a>
                                                <p className="getInvolved__applicationDeadline">
                                                    Apply by{" "}
                                                    <time dateTime={creativeApplication.closesAt}>
                                                        {creativeApplicationDeadlineFormatter.format(
                                                            new Date(creativeApplication.closesAt)
                                                        )}
                                                    </time>
                                                </p>
                                            </>
                                        ) : (
                                            <EmailContactDialog
                                                draft={getContactDraft(committee)}
                                                title={`Interested in ${committee.name}?`}
                                                triggerLabel="Contact"
                                            />
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>

            </main>
        </div>
    );
}

export default GetInvolvedPage;
