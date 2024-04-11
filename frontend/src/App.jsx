import HomePage from "./pages/Home";
import EventsPage from "./pages/Events";
import ResourcesPage from "./pages/Resources"
import AboutPage from "./pages/About"
import ContactPage from "./pages/Contact"
import { Route, Routes } from "react-router-dom";
import Navbar from "./layouts/Navbar";
import { useMsal, useAccount } from "@azure/msal-react";
import { useState, useEffect } from "react";
import { loginRequest } from "./authConfig";
import Cookies from "js-cookie";
import Footer from "./layouts/Footer";


function App() {
  const [isAuthenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState({});
  const { instance, accounts } = useMsal();
  const account = useAccount(accounts[0] || {});

  // Re-run effect if account state changes
  useEffect(() => {
    if (account) {
      console.log(account)
      setAuthenticated(true);
      setUser({
        given_name: account.idTokenClaims.given_name,
        family_name: account.idTokenClaims.family_name,
        email: account.idTokenClaims.email,
        auth_time: account.idTokenClaims.auth_time,
        username: account.idTokenClaims.preferred_username
      });
    } else {
      setAuthenticated(false);
    }
  }, [account]);

  const signIn = async () => {
    const interactionIncomplete = Cookies.get('msal.interaction.status');

    if (interactionIncomplete) {
        console.log("Microsoft sign out was incomplete.");
        console.log(interactionIncomplete);
    } else {
        instance.loginPopup(loginRequest).then(res => {
          const accessToken = res.accessToken;
          fetch('http://localhost:7777/api/v1/users/login', {
              method: "POST",
              headers: {
                  'Authorization': `Bearer ${accessToken}`
              }
          }).catch((error) => {
              console.log(error);
          })
        })
    }
  }

  const signOut = async (event) => {
    const interactionIncomplete = Cookies.get('msal.interaction.status');

    if (interactionIncomplete) {
      console.log("Microsoft sign out was incomplete.");
      console.log(interactionIncomplete);
    } else {
      await instance.logoutPopup().then(res => {
        fetch('http://localhost:7777/api/v1/users/logout').catch(e => {
          console.log(e);
        });
      }).catch(e => { console.log(e) });
    }
  }

  return (
    <div>
        <Navbar signIn={signIn} signOut={signOut} isAuthenticated={isAuthenticated} />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
        </Routes>
        <Footer />
    </div>
  );
}

export default App;
