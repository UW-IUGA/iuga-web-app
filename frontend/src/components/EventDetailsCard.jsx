import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLocationDot, faUser, faClock, faUsers, faParagraph } from '@fortawesome/free-solid-svg-icons'
import { useEffect, useState, useRef } from "react";
import { toast} from 'react-toastify';
import { useAuthContext } from "../context/AuthContext";
import Tag from "./Tag";
import Button from "./Button";

const EventDetailsCard = ({selectedEvent, handleRSVP, deselectEventDetails}) => {
    const wrapperRef = useRef(null);
    const { isAuthenticated } = useAuthContext();
    const [buttonDisabled, setButtonDisabled] = useState(false);

    const isRSVPAllowed = event => {
        const today = new Date();
        const eventStartDate = new Date(event.eStartDate);
        return event.rsvpEnabled && today <= eventStartDate;
    };

    const showRSVPStatus = event => {
        const today = new Date();
        const eventStartDate = new Date(event.eStartDate);
        return !event.rsvpEnabled && today <= eventStartDate && !event.eAltLink.title && !event.eAltLink.url;
    };

    const rsvp = async (event, eId) => {
        event.preventDefault();
        if (isAuthenticated) {
            setButtonDisabled(true);
            const form = event.target;
            const formData = new FormData(form);
            const answers = [];
            selectedEvent.rsvpQuestions.forEach((question) => {
                answers.push({
                    qId: question.qId,
                    aString: formData.get(`eventqa-${question.qId}`)
                });
            });

            fetch(`${process.env.REACT_APP_API_URL}/api/v1/events/rsvp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ eId: eId, rsvpAnswers: answers }),
            }).then((res) => res.json())
            .then(data => {
                setButtonDisabled(false);
                if (data.status === "error") {
                    toast.error(data.message);
                } else {
                    toast.success(data.message);
                    handleRSVP();
                }
            }).catch(err => {
                setButtonDisabled(false);
                toast.error("RSVP was not successful :( Please try again.");
                console.log(err);
            });
        } else {
            toast.error("Please login first to RSVP!");
        }
    };

    useEffect(() => {
        const handleClickOutside = event => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                deselectEventDetails();
            }
        };

        const timer = setTimeout(() => {
            document.addEventListener("click", handleClickOutside);
        }, 0);


        return () => {
            clearTimeout(timer);
            document.removeEventListener("click", handleClickOutside);
        };
    }, [deselectEventDetails]);

    return(
    <div className="event-details-container" ref={wrapperRef}>
        <div className="event-details-wrapper">
            <div className="event-details-content">
                <img alt='event thumbnail'></img>
                <div className="event-details-header">
                    <h1>{selectedEvent.eName ? selectedEvent.eName : "Event Name"}</h1>
                    <div className="event-details-info">
                        <div className="event-details-section-header">
                            <FontAwesomeIcon icon={faUser} />
                            <p>{selectedEvent.eOrganizers ? selectedEvent.eOrganizers : "Organizers"}</p>
                        </div>
                        { selectedEvent.showParticipants && 
                        (<div className="event-details-section-header">
                            <FontAwesomeIcon icon={faUsers} />
                            <p>{selectedEvent.participants} Participants</p>
                        </div>)}
                    </div>
                </div>
                <div className="event-details-tags">
                    {selectedEvent.eLabels ? selectedEvent.eLabels.map(category => {
                        return <Tag key={category} text={category} type={category} isSmall={true} />;
                    }) : <Tag key={"social"} text={"social"} type={"social"} isSmall={true} />}
                </div>
                <div className="event-details-body">
                    <div className="event-details-section-wrapper">
                        <div>
                            <div className="event-details-section">
                                <div className="event-details-section-header">
                                    <FontAwesomeIcon icon={faLocationDot} />
                                    <span>Location</span>
                                </div>
                                <p>{selectedEvent.eLocation ? selectedEvent.eLocation : "MGH120"}</p>
                            </div>
                            <div className="event-details-section">
                                <div className="event-details-section-header">
                                    <FontAwesomeIcon icon={faClock} />
                                    <span>Date</span>
                                </div>
                                <p>{selectedEvent.eStartDateFormatted ? selectedEvent.eStartDateFormatted : "Jan 12, 12 30 PM"}</p>
                            </div>
                        </div>
                    </div>
                    <div className="event-details-section">
                        <div className="event-details-section-header">
                            <FontAwesomeIcon icon={faParagraph} />
                            <span>Description</span>
                        </div>
                        <p className="event-details-description">{selectedEvent.eDescription ? selectedEvent.eDescription : "Event Description"}</p>
                    </div>
                </div>
                <div className="event-details-rsvp">
                    { showRSVPStatus(selectedEvent) && (<p className="rsvp-status">RSVP Disabled</p>)}
                    { isRSVPAllowed(selectedEvent) ? (
                    <div>
                        { selectedEvent.rsvpQuestions.length !== 0 && (<h1>Come Join Us!</h1>) }
                        <form className="event-details-rsvp-form" onSubmit={(event) => rsvp(event, selectedEvent.eId)}>
                            { selectedEvent.rsvpQuestions.map((question, i) => {
                                const userAnswer = selectedEvent.rsvpAnswers ? selectedEvent.rsvpAnswers.find(answer => answer.qId === question.qId) : null;
                                return (<div key={question.qId}>
                                    <label html={`eventqa-${question.qId}`} for={`eventqa-${question.qId}`} className="form-label">{question.qString}</label>
                                    <input 
                                        type="text" 
                                        name={`eventqa-${question.qId}`} 
                                        id={`eventqa-${question.qId}`} 
                                        defaultValue={userAnswer ? userAnswer.aString : ''}
                                        disabled={selectedEvent.hasRSVPd}
                                        placeholder="Your answer"
                                        className="form-input" 
                                        required />
                                </div>)
                            })}
                            <span className="filler" />
                            {selectedEvent.hasRSVPd ?
                                <Button text="You are registered!" className="secondary-button" onSubmit={() => {}}/>
                                :
                                <Button text="RSVP" className="primary-button" isDisabled={buttonDisabled}/>
                            }
                        </form>
                    </div>
                    ) : selectedEvent.eAltLink?.title && selectedEvent.eAltLink?.url 
                        && <Button 
                            text={selectedEvent.eAltLink.title} 
                            className="primary-button" 
                            onClick={() => {window.open(selectedEvent.eAltLink.url, '_blank');}} />}
                </div>
            </div>
        </div>
    </div>
   )
};

export default EventDetailsCard;