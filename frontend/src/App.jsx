import HomePage from "./pages/Home";
import EventsPage from "./pages/Events";
import AdminEventRequests from "./pages/AdminEventRequests";
import AdminEvents from "./pages/AdminEvents";
import AdminEventReview from "./pages/AdminEventReview";
import AdminCalendar from "./pages/AdminCalendar";
import AdminRequest from "./pages/AdminRequest";
import AdminPipeline from "./pages/AdminPipeline";
import AdminCharter from "./pages/AdminCharter";
import AdminJournal from "./pages/AdminJournal";
import AdminContacts from "./pages/AdminContacts";
import AdminDashboard from "./pages/AdminDashboard";
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
import { useState, useEffect } from "react";
import { mockCalendarData } from "./assets/mock-data/MockCalendarData";
import { enrichWithDevThumbnails } from "./utils/devThumbnails";
import { resources } from "./assets/data/ResourcesData";
import { iugaCandidates } from "./assets/data/CandidateData";
import { electionFAQ } from "./assets/data/ElectionFAQData";
import { iugaTeams } from "./assets/data/AboutData";
import PublicLayout from "./layouts/PublicLayout";
import AdminLayout from "./layouts/AdminLayout";
import { isProduction } from "./runtime";

function App() {
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
            <Routes>
                <Route element={<PublicLayout />}>
                    <Route path="/" element={<HomePage upcomingEvents={upcomingEvents} />} />
                    <Route path="/events" element={<EventsPage />} />
                    <Route path="/resources" element={<ResourcesPage resources={resources} />} />
                    <Route path="/student-voice" element={<StudentVoicePage />} />
                    <Route path="/shop" element={<ShopPage />} />
                    <Route path="/elections" element={<ElectionPage candidates={iugaCandidates} />} />
                    <Route path="/electionfaq" element={<ElectionsFAQPage electionFAQ={electionFAQ} />} />
                    <Route path="/about" element={<AboutPage teams={iugaTeams} />} />
                    <Route path="/get-involved" element={<GetInvolvedPage />} />
                </Route>
                <Route element={<AdminLayout />}>
                    <Route path="/admin" element={<AdminDashboard />} />
                    <Route path="/admin/events" element={<AdminEvents />} />
                    <Route path="/admin/calendar" element={<AdminCalendar />} />
                    <Route path="/admin/pipeline" element={<AdminPipeline />} />
                    <Route path="/admin/pipeline/:id" element={<AdminRequest />} />
                    <Route path="/admin/event-requests" element={<AdminEventRequests />} />
                    <Route path="/admin/events/review/:id" element={<AdminEventReview />} />
                    <Route path="/admin/event-requests/review/:id" element={<AdminEventReview />} />
                    <Route path="/admin/charter" element={<AdminCharter />} />
                    <Route path="/admin/journal" element={<AdminJournal />} />
                    <Route path="/admin/contacts" element={<AdminContacts />} />
                </Route>
            </Routes>
        </div>
    );
}

export default App;
