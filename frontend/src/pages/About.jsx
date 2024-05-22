// import AboutCard from "../components/AboutCard";
import GradientLine from "../components/GradientLine";
import { useEffect } from "react";
import { useLocation } from 'react-router-dom';
// import Dropdown from "../components/Dropdown";
import ResourceCard from "../components/ResourceCard";

function AboutPage({ members }) {
    const {pathname} = useLocation();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);
    
    return (
        <div className="baseContainer">
            <div className="aboutSum">
                <img className="aboutImg" src="/assets/about-main.png" alt="group of iuga students" />
                <div className="sum">
                    <h1>IUGA History</h1>
                    <p>
                        Long ago, the four nations lived together in harmony. Then, everything changed when the Fire
                        Nation attacked. Only the Avatar, master of all four elements, could stop them, but when the
                        world needed him most, he vanished. A hundred years passed and my brother and I discovered the
                        new Avatar, an airbender named Aang, and although his airbending skills are great, he has a lot
                        to learn before he's ready to save anyone. But I believe Aang can save the world.
                    </p>
                </div>
            </div>
            <div className="aboutContainer">
                <div>
                    <h2>Officers</h2>
                    {/* <Dropdown /> */}
                </div>
                <GradientLine className="fullWidth" />
                <h2>WebDev Committee</h2>
                <GradientLine className="fullWidth" />
                <h2>Creative Committee</h2>
                <GradientLine className="fullWidth" />
                <h2>Affiliated RSOs</h2>
                <GradientLine className="fullWidth" />
                {members.rsos.map((rso, index) => (
                    <ResourceCard key={index} resource={rso} />
                ))}
            </div>
        </div>
    );
}

export default AboutPage;
