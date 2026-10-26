import HomePage from "./pages/Home";
import EventsPage from "./pages/Events";
import ResourcesPage from "./pages/Resources";
import ElectionPage from "./pages/Elections";
import ElectionsFAQPage from "./pages/ElectionsFAQ";
import AboutPage from "./pages/About";
import GetInvolvedPage from "./pages/GetInvolved";
import StudentVoicePage from "./pages/StudentVoice";
import ShopPage from "./pages/Shop";
import ShopCheckoutPage from "./pages/ShopCheckout";
import ShopOrdersPage from "./pages/ShopOrders";
import ShopPickupPage from "./pages/ShopPickup";
import { ToastContainer, Bounce } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Navbar from "./layouts/Navbar";
import { ShopCartProvider } from "./context/ShopCartContext";
import ShopMaintenanceBanner from "./components/ShopMaintenanceBanner";
import { useState, useEffect } from "react";
import { mockCalendarData } from "./assets/mock-data/MockCalendarData";
import { enrichWithDevThumbnails } from "./utils/devThumbnails";
import { resources } from "./assets/data/ResourcesData";
import { iugaCandidates } from "./assets/data/CandidateData";
import { electionFAQ } from "./assets/data/ElectionFAQData";
import { iugaTeams } from "./assets/data/AboutData";
import { useAuthContext } from "./context/AuthContext";
import SignInRequired from "./components/SignInRequired";
import Footer from "./layouts/Footer";
import { isProduction } from "./runtime";
import { useTheme } from "./utils/theme";
import { ADMIN_ROOT_PATH, ADMIN_HOME_PATH, ADMIN_SECTIONS, isAdminPath } from "./adminSections";

// The page component for each admin path in ADMIN_SECTIONS. Routes come from that list.
const ADMIN_PAGES = {
    "/admin/shop/orders": ShopOrdersPage,
    "/admin/shop/pickup": ShopPickupPage,
};

function App() {
    const { signIn, signOut } = useAuthContext();
    const { pathname } = useLocation();
    // Admin pages bring their own admin bar instead of the public site navbar and footer,
    // and keep their own light palette whatever the site theme (base/theme).
    const showSiteChrome = !isAdminPath(pathname);
    const { theme } = useTheme();
    const pageTheme = showSiteChrome ? theme : "light";
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
        <div id="rootContainer" data-theme={showSiteChrome ? undefined : "light"}>
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
                theme={pageTheme}
                transition={Bounce}
            />
            {showSiteChrome && <Navbar signIn={signIn} signOut={signOut} />}
            <ShopCartProvider>
            {showSiteChrome && <ShopMaintenanceBanner />}
            <Routes>
                <Route path="/" element={<HomePage upcomingEvents={upcomingEvents} />} />
                <Route path="/events" element={<EventsPage />} />
                <Route path="/resources" element={<ResourcesPage resources={resources} />} />
                <Route
                    path="/student-voice"
                    element={
                        <SignInRequired>
                            <StudentVoicePage />
                        </SignInRequired>
                    }
                />
                <Route path="/shop" element={<ShopPage />} />
                <Route path="/shop/checkout/:holdId" element={<ShopCheckoutPage />} />
                {/* The admin home, plus any unknown admin address, opens the first admin page. */}
                <Route path={`${ADMIN_ROOT_PATH}/*`} element={<Navigate to={ADMIN_HOME_PATH} replace />} />
                {ADMIN_SECTIONS.flatMap((section) => section.items).map((item) => {
                    const Page = ADMIN_PAGES[item.path];
                    return <Route key={item.path} path={item.path} element={<Page />} />;
                })}
                <Route path="/elections" element={<ElectionPage candidates={iugaCandidates} />} />
                <Route path="/electionfaq" element={<ElectionsFAQPage electionFAQ={electionFAQ} />} />
                <Route path="/about" element={<AboutPage teams={iugaTeams} />} />
                <Route path="/get-involved" element={<GetInvolvedPage />} />
            </Routes>
            </ShopCartProvider>
            {showSiteChrome && <Footer />}
        </div>
    );
}

export default App;
