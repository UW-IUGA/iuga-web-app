import ResourceCard from "../components/ResourceCard";
import GradientLine from "../components/GradientLine";
import { resourceTags } from "../assets/data/Enum";
import { useEffect, useRef } from "react";
import { useLocation } from 'react-router-dom';

function ResourcesPage({ resources }) {
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
                {/* <div className="blob3"></div> */}
                <div className="resourceHeader">
                    <div className="resourceImgContainer">
                        <img className="resourceImg" src="/assets/resources-main.png" alt="student looking for resources" />
                    </div>
                    <div className="resourceSummary">
                        <h1>Resources</h1>
                        <p>
                            IUGA is just one of many RSOs and groups affiliated with the iSchool that makes the iSchool everything it is. 
                            Explore the resources below to take full advantage of everything the iSchool offers its students! 
                            From academic and career resources to personal mental health, the iSchool community does its best to support 
                            its students in every area it can.
                        </p>
                    </div>
                </div>
                <div className="resourceContentContainer">
                    <div className="legendContainer">
                        <div className="legend">
                            <h3 className="legendHeader">Categories</h3>
                            <ul>
                                {Object.values(resourceTags).map((category) => (
                                    <li key={category} onClick={() => handleClick(category)}>
                                        {category === "Diversity, Equity, and Inclusion (DEI)" ? "DEI" : category}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <div className="resourcesWrapper">
                        {Object.values(resourceTags).map((category) => (
                            <div className="resourceBoxContainer" key={category} ref={(el) => (categoryRefs.current[category] = el)}>
                                <div className="resourceCategoryHeader">
                                    <h2>{category}</h2>
                                </div>
                                { resources[category]
                                    .map((filteredResource) => (<ResourceCard key={filteredResource.rName} resource={filteredResource} />))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ResourcesPage;
