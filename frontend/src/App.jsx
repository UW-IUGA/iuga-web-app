import HomePage from "./pages/Home";
import EventsPage from "./pages/Events";
import ResourcesPage from "./pages/Resources";
import AboutPage from "./pages/About";
import { ToastContainer, Bounce } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Route, Routes } from "react-router-dom";
import Navbar from "./layouts/Navbar";
import { useState, useEffect } from "react";
import { mockCalendarData } from "./assets/mock-data/MockCalendarData";
import { mockResources } from "./assets/mock-data/MockResourcesData";
import { mockMembers } from "./assets/mock-data/MockAboutData";
import { useAuthContext } from './context/AuthContext';
import Footer from "./layouts/Footer";

function App() {
    const { signIn, signOut } = useAuthContext();
    const [upcomingEvents, setUpcomingEvents] = useState([]);


    useEffect(() => {
        if (process.env.NODE_ENV === "production") {
            fetch("http://localhost:7777/api/v1/events/upcoming", {
                method: "GET",
            }).then((res) => res.json())
            .then((events) => {
                setUpcomingEvents(events);
            }).catch((error) => {
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
                <Route path="/resources" element={<ResourcesPage resources={mockResources} />} />
                <Route path="/about" element={<AboutPage members={mockMembers} />} />
            </Routes>
            <Footer />
        </div>
    );
}

export default App;
