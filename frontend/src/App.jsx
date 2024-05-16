import HomePage from "./pages/Home";
import EventsPage from "./pages/Events";
import ResourcesPage from "./pages/Resources";
import AboutPage from "./pages/About";
import { Route, Routes } from "react-router-dom";
import Navbar from "./layouts/Navbar";
import { useMsal, useAccount } from "@azure/msal-react";
import { useState, useEffect } from "react";
import { loginRequest } from "./authConfig";
import { mockCalendarData } from "./assets/mock-data/MockCalendarData";
import { mockResources } from "./assets/mock-data/MockResourcesData";
import { mockMembers } from "./assets/mock-data/MockAboutData";
import Cookies from "js-cookie";
import Footer from "./layouts/Footer";

function App() {
    const [isAuthenticated, setAuthenticated] = useState(true);
    const [upcomingEvents, setUpcomingEvents] = useState([]);
    const { instance, accounts } = useMsal();
    const account = useAccount(accounts[0] || {});

    useEffect(() => {
        if (process.env.NODE_ENV === "production") {
            fetch("http://localhost:7777/api/v1/events/upcoming", {
                method: "GET",
            })
                .then((res) => res.json())
                .then((upcomingEvents) => {
                    setUpcomingEvents(upcomingEvents);
                })
                .catch((error) => {
                    console.log(error);
                });
        } else {
            setUpcomingEvents(mockCalendarData);
        }
    }, []);

    // Re-run effect if account state changes
    useEffect(() => {
        if (process.env.NODE_ENV === "production") {
            if (account) {
                setAuthenticated(true);
            } else {
                setAuthenticated(false);
            }
        } else {
            setAuthenticated(true);
        }
    }, [account]);

    const signIn = async () => {
        const interactionIncomplete = Cookies.get("msal.interaction.status");

        if (interactionIncomplete) {
            console.log("Microsoft sign out was incomplete.");
            console.log(interactionIncomplete);
        } else {
            instance.loginPopup(loginRequest).then((res) => {
                const accessToken = res.accessToken;
                fetch("http://localhost:7777/api/v1/users/login", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                })
                    .then((res) => res.json())
                    .catch((error) => {
                        console.log(error);
                    });
            });
        }
    };

    const signOut = async (event) => {
        const interactionIncomplete = Cookies.get("msal.interaction.status");

        if (interactionIncomplete) {
            console.log("Microsoft sign out was incomplete.");
            console.log(interactionIncomplete);
        } else {
            await instance
                .logoutPopup()
                .then((res) => {
                    fetch("http://localhost:7777/api/v1/users/logout", {
                        method: "POST",
                    }).catch((e) => {
                        console.log(e);
                    });
                })
                .catch((e) => {
                    console.log(e);
                });
        }
    };

    return (
        <div id="rootContainer">
            <Navbar signIn={signIn} signOut={signOut} isAuthenticated={isAuthenticated} />
            <Routes>
                <Route path="/" element={<HomePage upcomingEvents={upcomingEvents} />} />
                <Route path="/events" element={<EventsPage isAuthenticated={isAuthenticated} />} />
                <Route path="/resources" element={<ResourcesPage resources={mockResources} />} />
                <Route path="/about" element={<AboutPage members={mockMembers} />} />
            </Routes>
            <Footer />
        </div>
    );
}

export default App;
