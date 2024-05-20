import React from "react";
import ContentLoader from "react-content-loader";

const EventDetailsLoader = (props) => (
    <div className="event-details-container">
        <ContentLoader 
            speed={2}
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
    </div>

)

export default EventDetailsLoader;