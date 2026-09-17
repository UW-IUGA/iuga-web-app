import { studentVoiceForms } from "../assets/data/StudentVoiceData";

// Microsoft Forms responses live on these domains. Any other host is linked, never framed.
const FORMS_HOSTS = new Set(["forms.cloud.microsoft", "forms.office.com"]);

/**
 * @behavior true only for an HTTPS Microsoft Forms link, so a mistyped or unrelated
 * URL falls back to a plain link instead of rendering a blank or hostile frame.
 * @param {string} href configured survey URL
 * @returns {boolean}
 */
function isEmbeddableFormsUrl(href) {
    try {
        const url = new URL(href);
        return url.protocol === "https:" && FORMS_HOSTS.has(url.hostname);
    } catch {
        return false;
    }
}

/**
 * @behavior adds Microsoft's embed flag so the form renders on its own, without the
 * surrounding Forms site chrome.
 * @param {string} href configured survey URL
 * @returns {string} URL suitable for the iframe source
 */
function toEmbedUrl(href) {
    const url = new URL(href);
    url.searchParams.set("embed", "true");
    return url.toString();
}

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
                            {forms.map((form) => {
                                const canEmbed = isEmbeddableFormsUrl(form.href);

                                return (
                                    <article
                                        className={`studentVoiceCard editorial-card${canEmbed ? " studentVoiceCard--embed" : ""}`}
                                        key={form.href}
                                    >
                                        <div className="studentVoiceCard__meta">
                                            {form.topic && <span>{form.topic}</span>}
                                            {form.closesOn && <span>{form.closesOn}</span>}
                                        </div>
                                        <h3>{form.title}</h3>
                                        <p>{form.description}</p>
                                        <a
                                            className="pill-button"
                                            href={form.href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label={`Open this form in a new tab: ${form.title}`}
                                        >
                                            Open this form in a new tab <span aria-hidden="true">↗</span>
                                        </a>
                                        {canEmbed && (
                                            <>
                                                <iframe
                                                    className="studentVoiceCard__frame"
                                                    title={form.title}
                                                    src={toEmbedUrl(form.href)}
                                                    loading="lazy"
                                                />
                                                <p className="studentVoiceCard__note">
                                                    Microsoft runs this survey and shows its own confirmation once you
                                                    submit. If it does not appear above, open it in a new tab.
                                                </p>
                                            </>
                                        )}
                                    </article>
                                );
                            })}
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
