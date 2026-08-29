import { useEffect, useState } from "react";
import AdminRoute from "../components/AdminRoute";
import { useAuthContext } from "../context/AuthContext";
import { adminRequest } from "../utils/adminApi";

function AdminCharter() {
    const { can } = useAuthContext();
    const [sections, setSections] = useState([]);
    const [selected, setSelected] = useState(null);
    const [content, setContent] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        const loadSections = async () => {
            try {
                const { sections: loadedSections } = await adminRequest("charter");
                const nextSections = loadedSections || [];
                const requestedKey = window.location.hash.slice(1);
                const initialSection = nextSections.find((section) => section.sectionKey === requestedKey) || nextSections[0] || null;
                setSections(nextSections);
                setSelected(initialSection);
                setContent(initialSection?.content || "");
            } catch (requestError) {
                setError(requestError.message);
            }
        };

        loadSections();
    }, []);

    const selectSection = (section) => {
        setSelected(section);
        setContent(section.content);
    };

    const saveSection = async (event) => {
        event.preventDefault();
        try {
            const { section } = await adminRequest(`charter/${selected.sectionKey}`, {
                method: "PATCH",
                body: JSON.stringify({ content }),
            });
            setSections((current) => current.map((item) => item.sectionKey === section.sectionKey ? section : item));
            setSelected(section);
            setContent(section.content);
        } catch (requestError) {
            setError(requestError.message);
        }
    };

    return (
        <AdminRoute requiredPermission="charter.read">
            <main className="baseContainer adminPage" id="charter">
                <header className="adminPageHeader">
                    <span className="event-ops-kicker">Reference library</span>
                    <h1>Charter and guidelines</h1>
                    <p>Keep procedure available to the board instead of relying on memory.</p>
                </header>
                {error && <p className="event-ops-error" role="alert">{error}</p>}
                <div className="adminMemoryLayout">
                    <nav className="adminMemoryNav" aria-label="Charter sections">
                        {sections.map((section) => <a href={`#${section.sectionKey}`} key={section.sectionKey} className={selected?.sectionKey === section.sectionKey ? "standard-button" : "cta-primary"} onClick={() => selectSection(section)}>{section.title}</a>)}
                    </nav>
                    {selected ? (
                        <article className="adminMemoryCard editorial-card">
                            <h2>{selected.title}</h2>
                            {can("charter.manage") ? (
                                <form onSubmit={saveSection}>
                                    <label className="form-label">Guidelines content<textarea className="form-input" rows="18" value={content} onChange={(event) => setContent(event.target.value)} /></label>
                                    <button className="standard-button" type="submit">Save guidelines</button>
                                </form>
                            ) : <p className="adminMemoryContent">{selected.content}</p>}
                        </article>
                    ) : <p className="adminMemoryEmpty">No charter sections are available yet.</p>}
                </div>
            </main>
        </AdminRoute>
    );
}

export default AdminCharter;
