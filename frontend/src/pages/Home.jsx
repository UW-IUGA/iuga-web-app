import Button from "../components/Button";
import CharacterCard from "../components/CharacterCard";
import { MouseParallax, ScrollParallax } from 'react-just-parallax';
import { Fade } from "react-awesome-reveal";
import EventCard from "../components/EventCard";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useLocation } from 'react-router-dom';
import groups from "../assets/gallery/groups.png";
import bowling from "../assets/gallery/bowling.jpeg";
import merch from "../assets/gallery/merch.jpeg";
import gamenight from "../assets/gallery/gamenight.png";
import panelists from "../assets/gallery/panelists.png";
import heart from "../assets/gallery/heart.jpeg";
import gamenight2 from "../assets/gallery/gamenight-2.png";
import officers22 from "../assets/gallery/officers-22.png";
import careerIcon from "../assets/icons/career-icon.svg";
import socialIcon from "../assets/icons/social-icon.svg";
import academicIcon from "../assets/icons/academic-icon.svg";

function HomePage({upcomingEvents}) {
    const navigate = useNavigate();
    const {pathname} = useLocation();
    const categories = ["Academic", "Social", "Career"];

    const generateBackgroundIcons = (n) => {
        const images = [
          { src: careerIcon, alt: 'Career Icon' },
          { src: socialIcon, alt: 'Social Icon' },
          { src: academicIcon, alt: 'Academic Icon' },
        ];
      
        const repeatedImages = [];
      
        for (let i = 0; i < n; i++) {
          images.forEach((image, index) => {
            repeatedImages.push(
              <img key={`${index}-${i}`} src={image.src} alt={image.alt} />
            );
          });
        }
      
        return repeatedImages;
    };

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    return (
        <div className="baseContainer">
            <div className="introduction">
                <h1>Informatics</h1>
                <h1>Undergraduate Association</h1>
                <p>IUGA is a student-led RSO that communicates between the Informatics student body, faculty, and administration of the University of Washington Information School.</p>
                <div className="characterCardContainer">
                    {/* <div className="backgroundIcons">
                        <ScrollParallax isAbsolutelyPositioned={false}>
                        {generateBackgroundIcons(10)}
                        </ScrollParallax>
                    </div> */}
                    <MouseParallax isAbsolutelyPositioned strength={0.035} shouldPause>
                        <div className="characterBackground1 characterBackgroundLeft">
                            <img src={careerIcon} alt="" />
                            <img src={socialIcon} alt="" />
                            <img src={academicIcon} alt="" />
                        </div>
                    </MouseParallax>
                    <MouseParallax isAbsolutelyPositioned strength={0.015} shouldPause>
                        <div className="characterBackground2 characterBackgroundLeft">
                            <img src={socialIcon} alt="" />
                            <img src={academicIcon} alt="" />
                            <img src={careerIcon} alt="" />
                        </div>
                    </MouseParallax>
                    <MouseParallax isAbsolutelyPositioned strength={0.005} shouldPause>
                        <div className="characterBackground3 characterBackgroundLeft">
                            <img src={academicIcon} alt="" />
                            <img src={socialIcon} alt="" />
                            <img src={careerIcon} alt="" />
                        </div>
                    </MouseParallax>
                    { categories.map(category => {
                        return <CharacterCard key={category} category={category} />;
                    })}
                    <MouseParallax isAbsolutelyPositioned strength={0.035} shouldPause>
                        <div className="characterBackground1 characterBackgroundRight">
                            <img src={careerIcon} alt="" />
                            <img src={socialIcon} alt="" />
                            <img src={academicIcon} alt="" />
                        </div>
                    </MouseParallax>
                    <MouseParallax isAbsolutelyPositioned strength={0.015} shouldPause>
                        <div className="characterBackground2 characterBackgroundRight">
                            <img src={academicIcon} alt="" />
                            <img src={careerIcon} alt="" />
                            <img src={socialIcon} alt="" />
                        </div>
                    </MouseParallax>
                    <MouseParallax isAbsolutelyPositioned strength={0.005} shouldPause>
                        <div className="characterBackground3 characterBackgroundRight">
                            <img src={academicIcon} alt="" />
                            <img src={careerIcon} alt="" />
                            <img src={socialIcon} alt="" />
                        </div>
                    </MouseParallax>
                </div>
            </div>
            <Fade triggerOnce={true} fraction={0.3}>
                <div className="upcomingEvents">
                    <h1>Latest Events</h1>
                    <div className="upcomingEventsCardContainer">
                        {/* <ScrollParallax isAbsolutelyPositioned={true} strength={0.02}>
                            <img className="upcomingEventsBackground" src={socialIcon} />
                            <img className="upcomingEventsBackground" src={academicIcon} />
                            <img className="upcomingEventsBackground" src={careerIcon} />
                        </ScrollParallax> */}
                        { upcomingEvents.slice(0, 3).map((event, i) => {
                            return <EventCard key={event.eName} event={event} decorate={i === 2 ? true : false }/>;
                        })}
                    </div>
                    <Button text="More Events" className="primary-button" type="right-arrow" color="black" onClick={() => {navigate("/events")}}/>
                </div>
            </Fade>
            <Fade triggerOnce={true} fraction={0}>
                <div className="gallery">
                    <div className="galleryHeader">
                        <span></span>
                        <h1>Gallery</h1>
                        <span></span>
                    </div>
                    <div className="galleryImageContainer">
                        <div><img src={groups} alt="" /></div>
                        <div><img src={bowling} alt="" /></div>
                        <div><img src={merch} alt="" /></div>
                        <div><img src={gamenight} alt="" /></div>
                        <div><img src={panelists} alt="" /></div>
                        <div><img src={heart} alt="" /></div>
                        <div><img src={gamenight2} alt="" /></div>
                        <div><img src={officers22} alt="" /></div>
                    </div>
                    <div>
                        <img src="/assets/campfire.png" alt="characters around a campfire" />
                    </div>
                </div>
            </Fade>
        </div>
    )
}

export default HomePage;
