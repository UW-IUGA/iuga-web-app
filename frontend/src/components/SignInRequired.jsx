/*
 * Purpose: Gates a page behind the IUGA session. Members see the page; everyone else sees a locked
 *          preview of it, so the page still shows what it is worth signing in for.
 * Authentication/Authorization Requirements: Reads the session from the auth context and renders
 *          no children until that session has resolved.
 * Expected Request: The page to protect, passed as children.
 * Expected Response: The children when signed in, the locked preview when not, nothing while the
 *          session is still resolving.
 */
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { useAuthContext } from "../context/AuthContext";

const previewRows = [0, 1, 2];
const previewChoices = [0, 1, 2, 3, 4];

/*
 * Purpose: The blurred stand-in shown to visitors without a session.
 * Drawn in CSS rather than embedding the real survey, so a signed-out visitor never downloads
 * Microsoft's form app and no live form sits behind the overlay.
 */
function LockedPreview({ onSignIn }) {
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
                    </div>

                    <div className="studentVoicePreview editorial-card">
                        <div className="studentVoicePreview__form" aria-hidden="true">
                            <span className="studentVoicePreview__title" />
                            {previewRows.map((row) => (
                                <div className="studentVoicePreview__row" key={row}>
                                    <span className="studentVoicePreview__question" />
                                    <div className="studentVoicePreview__choices">
                                        {previewChoices.map((choice) => (
                                            <span className="studentVoicePreview__choice" key={choice} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="studentVoicePreview__overlay">
                            <FontAwesomeIcon icon={faLock} aria-hidden="true" className="studentVoicePreview__lock" />
                            <h2>Sign in required</h2>
                            <p>Sign in with your UW NetID to share your feedback with the IUGA executive board.</p>
                            <button type="button" className="pill-button" onClick={onSignIn}>
                                Sign in with UW NetID
                            </button>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}

function SignInRequired({ children }) {
    const { isAuthenticated, authLoading, signIn } = useAuthContext();

    // Held back until the session resolves: answering "not signed in" early would flash the
    // locked preview at a member who is in fact signed in.
    if (authLoading) return null;

    return isAuthenticated ? children : <LockedPreview onSignIn={signIn} />;
}

export default SignInRequired;
