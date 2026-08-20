import { studentVoiceForms } from "../assets/data/StudentVoiceData";

function StudentVoicePage({ forms = studentVoiceForms }) {
    return (
        <div className="baseContainer">
            <main className="studentVoice">
                <section className="studentVoice__hero" aria-labelledby="student-voice-title">
                    <p className="studentVoice__kicker">IUGA listening</p>
                    <h1 id="student-voice-title">Student Voice</h1>
                    <p>
                        Your perspective helps IUGA advocate for Informatics students and shape the programs, events,
                        and issues we bring forward throughout the year.
                    </p>
                </section>

                <section className="studentVoice__surveys" aria-labelledby="open-feedback-heading">
                    <div className="studentVoice__sectionHeader">
                        <h2 id="open-feedback-heading">Open feedback</h2>
                        {forms.length > 0 && <span>{forms.length} {forms.length === 1 ? "survey" : "surveys"}</span>}
                    </div>

                    {forms.length > 0 ? (
                        <div className="studentVoice__grid">
                            {forms.map((form) => (
                                <article className="studentVoiceCard editorial-card" key={form.href}>
                                    <div className="studentVoiceCard__meta">
                                        <span>{form.topic}</span>
                                        <span>{form.closesOn}</span>
                                    </div>
                                    <h3>{form.title}</h3>
                                    <p>{form.description}</p>
                                    <a
                                        className="pill-button"
                                        href={form.href}
                                        target="_blank"
                                        rel="noreferrer"
                                        aria-label={`Share your feedback: ${form.title}`}
                                    >
                                        Share your feedback <span aria-hidden="true">↗</span>
                                    </a>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <div className="studentVoice__empty editorial-card">
                            <h2>No surveys are open right now.</h2>
                            <p>Check back soon for new ways to share your perspective with the IUGA executive board.</p>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}

export default StudentVoicePage;
