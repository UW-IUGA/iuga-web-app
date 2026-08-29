import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { useAuthContext } from "../context/AuthContext";

function PublicLayout() {
    const { signIn, signOut } = useAuthContext();

    return (
        <>
            <Navbar signIn={signIn} signOut={signOut} />
            <Outlet />
            <Footer />
        </>
    );
}

export default PublicLayout;
