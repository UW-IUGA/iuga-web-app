import ResourceCard from "../components/ResourceCard";
import GradientLine from "../components/GradientLine";

function ResourcesPage() {
    return (
        <div className="baseContainer">
            <div className="resourceSum">
                <img
                    className="resourceImg"
                    src="/assets/resources-main.png"
                    alt="student looking for resources"
                />
                <div className="summary">
                    <h1>Resources</h1>
                    <p>
                        IUGA is a student-led RSO that communicates between the
                        Informatics student body, faculty, and administration of
                        the University of Washington Information School. We host
                        fun, community building events as well as events for
                        professional development.
                    </p>
                </div>
            </div>
            <div className="resourceContainer">
                <div className="legend">
                    <h3>Categories</h3>
                    <ul>
                        <li>Academic</li>
                        <li>Career</li>
                        <li>Community</li>
                        <li>Mental Health</li>
                        <li>DEI</li>
                    </ul>
                </div>
                <div className="resources">
                    <h2>Academic</h2>
                    <GradientLine />
                    <ResourceCard />
                    <h2>Career</h2>
                    <GradientLine />
                    <h2>Community</h2>
                    <GradientLine />
                    <h2>Mental Health</h2>
                    <GradientLine />
                    <h2>Diversity, Equity, and Inclusion (DEI)</h2>
                    <GradientLine />
                </div>
            </div>
        </div>
    );
}

export default ResourcesPage;
