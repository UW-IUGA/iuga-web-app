import HomePage from "./pages/Home";
import EventsPage from "./pages/Events";
import AdminEventRequests from "./pages/AdminEventRequests";
import ResourcesPage from "./pages/Resources";
import ElectionPage from "./pages/Elections";
import ElectionsFAQPage from "./pages/ElectionsFAQ";
import AboutPage from "./pages/About";
import GetInvolvedPage from "./pages/GetInvolved";
import StudentVoicePage from "./pages/StudentVoice";
import ShopPage from "./pages/Shop";
import { ToastContainer, Bounce } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Route, Routes } from "react-router-dom";
import Navbar from "./layouts/Navbar";
import { useState, useEffect } from "react";
import { mockCalendarData } from "./assets/mock-data/MockCalendarData";
import { enrichWithDevThumbnails } from "./utils/devThumbnails";
import { resources } from "./assets/data/ResourcesData";
import { iugaCandidates } from "./assets/data/CandidateData";
import { electionFAQ } from "./assets/data/ElectionFAQData";
import { iugaTeams } from "./assets/data/AboutData";
import { useAuthContext } from "./context/AuthContext";
import Footer from "./layouts/Footer";
import { isProduction } from "./runtime";

function App() {
    const { signIn, signOut } = useAuthContext();
    const [upcomingEvents, setUpcomingEvents] = useState([]);

    useEffect(() => {
        if (isProduction) {
            fetch('/api/v1/events/upcoming', {
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
            setUpcomingEvents(enrichWithDevThumbnails(mockCalendarData));
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
                <Route path="/admin/event-requests" element={<AdminEventRequests />} />
                <Route path="/resources" element={<ResourcesPage resources={resources} />} />
                <Route path="/student-voice" element={<StudentVoicePage />} />
                <Route path="/shop" element={<ShopPage />} />
                <Route path="/elections" element={<ElectionPage candidates={iugaCandidates} />} />
                <Route path="/electionfaq" element={<ElectionsFAQPage electionFAQ={electionFAQ} />} />
                <Route path="/about" element={<AboutPage teams={iugaTeams} />} />
                <Route path="/get-involved" element={<GetInvolvedPage />} />
            </Routes>
            <Footer />
        </div>
    );
}

export default App;
