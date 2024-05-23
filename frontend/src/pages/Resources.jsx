import ResourceCard from "../components/ResourceCard";
import GradientLine from "../components/GradientLine";
import { useEffect, useRef } from "react";
import { useLocation } from 'react-router-dom';

function ResourcesPage({ resources }) {
    const categories = ["Academic", "Career", "Community", "Mental Health", "Diversity, Equity, and Inclusion (DEI)"];

    const categoryRefs = useRef({});

    const {pathname} = useLocation();

    const handleClick = (category) => {
        const categoryRef = categoryRefs.current[category];
        if (categoryRef) {
            const yOffset = -100;
            const y = categoryRef.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: y, behavior: "smooth" });
        }
    };

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    return (
        <div className="baseContainer">
            <div className="resourceContainer">
                <div className="blob1"></div>
                <div className="blob2"></div>
                <div className="blob3"></div>
                <div className="resourceHeader">
                    <img className="resourceImg" src="/assets/resources-main.png" alt="student looking for resources" />
                    <div className="resourceSummary">
                        <h1>Resources</h1>
                        <p>
                            IUGA is a student-led RSO that communicates between the Informatics student body, faculty, and
                            administration of the University of Washington Information School. We host fun, community
                            building events as well as events for professional development.
                        </p>
                    </div>
                </div>
                <div className="resourceContentContainer">
                    <div className="legendContainer">
                        <div className="legend">
                            <h3 className="legendHeader">Categories</h3>
                            <ul>
                                {categories.map((category) => (
                                    <li key={category} onClick={() => handleClick(category)}>
                                        {category === "Diversity, Equity, and Inclusion (DEI)" ? "DEI" : category}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <div className="resourcesWrapper">
                        {categories.map((category) => (
                            <div key={category} ref={(el) => (categoryRefs.current[category] = el)}>
                                {category === "Diversity, Equity, and Inclusion (DEI)" ? (
                                    <>
                                        <h2>Diversity, Equity, and Inclusion (DEI)</h2>
                                        <GradientLine className="fullWidth" />
                                        {resources
                                            .filter((resource) => resource.tag === "dei")
                                            .map((filteredResource) => (
                                                <ResourceCard key={filteredResource.rName} resource={filteredResource} />
                                            ))}
                                    </>
                                ) : (
                                    <>
                                        <h2>{category}</h2>
                                        <GradientLine className="fullWidth" />
                                        {resources
                                            .filter((resource) => resource.tag === category.toLowerCase())
                                            .map((filteredResource) => (
                                                <ResourceCard key={filteredResource.rName} resource={filteredResource} />
                                            ))}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ResourcesPage;
