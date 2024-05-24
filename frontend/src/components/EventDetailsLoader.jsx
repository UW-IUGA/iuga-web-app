import React from "react";
import ContentLoader from "react-content-loader";
import MediaQuery from 'react-responsive';

const EventDetailsLoader = (props) => {
    return(
        <div className="event-details-container">
            <MediaQuery minWidth={1300}>
                <ContentLoader 
                    speed={1}
                    width={280}
                    height={600}
                    viewBox="0 0 300 632"
                    backgroundColor="#f3f3f3"
                    foregroundColor="#ecebeb"
                    {...props}
                >
                    <rect x="20" y="16" rx="0" ry="0" width="280" height="200" /> 
                    <rect x="20" y="240" rx="0" ry="0" width="179" height="45" /> 
                    <rect x="20" y="300" rx="0" ry="0" width="66" height="20" /> 
                    <rect x="20" y="340" rx="0" ry="0" width="135" height="24" /> 
                    <rect x="160" y="340" rx="0" ry="0" width="135" height="24" />
                    <rect x="20" y="375" rx="0" ry="0" width="135" height="24" /> 
                    <rect x="160" y="375" rx="0" ry="0" width="135" height="24" />
                </ContentLoader>
            </MediaQuery>
            <MediaQuery minWidth={1024}>
                <ContentLoader 
                    speed={1}
                    width={260}
                    height={632}
                    viewBox="0 0 260 632"
                    backgroundColor="#e6e6e6"
                    foregroundColor="#dedede"
                    {...props}
                >
                    <rect x="14" y="14" rx="0" ry="0" width="222" height="180" /> 
                    <rect x="14" y="210" rx="0" ry="0" width="175" height="35" /> 
                    <rect x="14" y="255" rx="0" ry="0" width="62" height="20" /> 
                    <rect x="14" y="285" rx="0" ry="0" width="216" height="24" /> 
                    <rect x="14" y="315" rx="0" ry="0" width="180" height="24" />
                </ContentLoader>
            </MediaQuery>
        </div>
    )
}

export default EventDetailsLoader;