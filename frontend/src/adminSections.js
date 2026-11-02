/*
 * Purpose: The one list of officer admin pages. The admin bar, the site navbar's Admin link, and the app's
 *          routes all read it, so a new section is added here and nowhere else in the frontend.
 * Authentication/Authorization Requirements: Each section names the permission that shows it. The pages
 *          themselves still check access through the API.
 * Expected Request Information: A pathname, or a can(permission) check from the auth context.
 * Expected Response Information: The admin paths, the admin home path, and the sections an officer may see.
 *
 * The server keeps its own list of these paths for direct page loads (backend/http/spaRoutes.js). Keep the two in step.
 */

export const ADMIN_ROOT_PATH = "/admin";

export const ADMIN_SECTIONS = [
    {
        key: "shop",
        label: "Shop",
        permission: "shop.purchases.review",
        items: [
            { path: "/admin/shop/orders", label: "Orders" },
            { path: "/admin/shop/pickup", label: "Pickup" },
        ],
    },
];

// Opening the admin area lands on the first page of the first section.
export const ADMIN_HOME_PATH = ADMIN_SECTIONS[0].items[0].path;

export function isAdminPath(pathname) {
    return pathname === ADMIN_ROOT_PATH || pathname.startsWith(`${ADMIN_ROOT_PATH}/`);
}

export function visibleAdminSections(can) {
    return ADMIN_SECTIONS.filter((section) => can(section.permission));
}
