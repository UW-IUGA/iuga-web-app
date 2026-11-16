import ElectionFAQCard from "../components/ElectionFAQCard";
import GradientLine from "../components/GradientLine";
import { electionfaqTags } from "../assets/data/Enum";
import { useEffect, useRef } from "react";
import { useLocation } from 'react-router-dom';

function ElectionsFAQPage({ electionFAQ }) {
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
            <div className="electionFaqContainer">
                <div className="blob1"></div>
                <div className="blob2"></div>
                {/* <div className="blob3"></div> */}
                <div className="electionFaqHeader">
                    <div className="electionFaqImgContainer">
                        <img className="electionFaqImg" src="/assets/elections.png" alt="student looking for resources" />
                    </div>
                    <div className="electionFaqSummary">
                        <h1>Elections FAQ Page</h1>
                        <p>
                            Below you'll find answers to common questions you may have about the IUGA election and campagining process.
                            If you still can't find the answer to what you're looking for, please reach out to us! 
                        </p>
                    </div>
                </div>
                <div className="electionFaqContent">
                    <div className="electionFaqLegendContainer">
                        <div className="electionFaqLegend">
                            <h3 className="electionFaqLegendHeader">Categories</h3>
                            <ul>
                                {Object.values(electionfaqTags).map((category) => (
                                    <li key={category} onClick={() => handleClick(category)}>
                                        {category === "Campaign Rules" ? "Campaign Rules" : category}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <div className="electionFaqCategories">
                        {Object.values(electionfaqTags).map((category) => (
                            <div className="electionFaqCategory" key={category} ref={(el) => (categoryRefs.current[category] = el)}>
                                <div className="electionFaqCategoryHeader">
                                    <h2>{category}</h2>
                                </div>
                                { electionFAQ[category]
                                    .map((filteredFAQ) => (<ElectionFAQCard key={filteredFAQ.rName} electionFAQ={filteredFAQ} />))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ElectionsFAQPage;