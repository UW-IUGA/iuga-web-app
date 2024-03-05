import HomePage from "./pages/Home";
import EventsPage from "./pages/Events";
import ResourcesPage from "./pages/Resources"
import AboutPage from "./pages/About"
import ContactPage from "./pages/Contact"
import { Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";

function App() {
  return (
    <div>
        <Navbar />
          <div className="navContainer">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/resources" element={<ResourcesPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
            </Routes>
          </div>
    </div>
  );
}

export default App;
