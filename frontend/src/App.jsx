import HomePage from "./pages/Home";
import EventsPage from "./pages/Events";
import ResourcesPage from "./pages/Resources";
import AboutPage from "./pages/About";
import ElectionPage from "./pages/Elections";
import ElectionsFAQPage from "./pages/ElectionsFAQ";
import { ToastContainer, Bounce } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Route, Routes } from "react-router-dom";
import Navbar from "./layouts/Navbar";
import { useState, useEffect } from "react";
import { mockCalendarData } from "./assets/mock-data/MockCalendarData";
import { resources } from "./assets/data/ResourcesData";
import { iugaCandidates } from "./assets/data/CandidateData";
import { electionFAQ } from "./assets/data/ElectionFAQData"; 
import { iugaTeams } from "./assets/data/AboutData";
import { positionInformation } from "./assets/data/AboutData";
import { useAuthContext } from "./context/AuthContext";
import Footer from "./layouts/Footer";
import MediaQuery from 'react-responsive';

function App() {
    const { signIn, signOut } = useAuthContext();
    const [upcomingEvents, setUpcomingEvents] = useState([]);

    useEffect(() => {
        if (process.env.NODE_ENV === "production") {
            fetch(`${process.env.REACT_APP_API_URL}/api/v1/events/upcoming`, {
                method: "GET",
            })
                .then((res) => res.json())
                .then((events) => {
                    setUpcomingEvents(events);
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setUpcomingEvents(mockCalendarData);
        }
    }, []);

    return (
        <div id="rootContainer">
            <ToastContainer
                position="bottom-center"
                autoClose={2000}
                hideProgressBar={false}
                newestOnTop={false}
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
                theme="light"
                transition={Bounce}
            />
            <Navbar signIn={signIn} signOut={signOut} />
            <Routes>
                <Route path="/" element={<HomePage upcomingEvents={upcomingEvents} />} />
                <Route path="/events" element={<EventsPage />} />
                <Route path="/resources" element={<ResourcesPage resources={resources} />} />
                <Route path="/about" element={<AboutPage teams={iugaTeams} />} />
                <Route path="/elections" element={<ElectionPage candidates={iugaCandidates} />} />
                <Route path="/electionfaq" element={<ElectionsFAQPage electionFAQ={electionFAQ} />} />
            </Routes>
            <Footer />
            {/* <MediaQuery minWidth={1024}>

            </MediaQuery>
            <MediaQuery minWidth={340} maxWidth={1023}>
                <div className="constructionContainer">
                    <h1>Informatics</h1>
                    <h1>Undergraduate Association</h1>
                    <p>🚧 The Mobile Page is Under Construction! 🚧</p>
                    <img src="/assets/about-main.png" alt="group of iuga students" />
                </div>
            </MediaQuery> */}
        </div>
    );
}

export default App;
