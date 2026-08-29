import { Outlet } from "react-router-dom";
import AdminNavigation from "./AdminNavigation";

function AdminLayout() {
    return (
        <div className="adminSurface">
            <AdminNavigation />
            <div className="adminSurface__content">
                <Outlet />
            </div>
        </div>
    );
}

export default AdminLayout;
