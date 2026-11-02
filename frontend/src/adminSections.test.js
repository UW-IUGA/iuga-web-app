/*
 * Purpose: Verify the admin area's section list helpers: which paths belong to the admin area and which
 *          sections a signed-in user may see.
 * Authentication/Authorization Requirements: Permissions are supplied directly as a can() function.
 * Expected Request Information: A pathname or a permission check.
 * Expected Response Information: Booleans and the visible section list.
 */
import { isAdminPath, visibleAdminSections } from "./adminSections";

describe("isAdminPath", () => {
    test("matches the admin home and its pages, but not paths that only start with the same letters", () => {
        expect(isAdminPath("/admin")).toBe(true);
        expect(isAdminPath("/admin/")).toBe(true);
        expect(isAdminPath("/admin/shop/orders")).toBe(true);
        expect(isAdminPath("/administrator")).toBe(false);
        expect(isAdminPath("/shop/orders")).toBe(false);
        expect(isAdminPath("/shop")).toBe(false);
    });
});

describe("visibleAdminSections", () => {
    test("lists a section only to users who hold its permission", () => {
        expect(visibleAdminSections(() => false)).toEqual([]);
        expect(visibleAdminSections((permission) => permission === "shop.purchases.review")
            .map((section) => section.label)).toEqual(["Shop"]);
    });
});
