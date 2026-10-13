import infoHoodie from "../shop/info-hoodie.png";
import infoCrewneck from "../shop/info-crewneck.png";
import infoBaseballTee from "../shop/info-baseball-tee.png";
import infoToteBag from "../shop/info-tote-bag.png";

// What each card says about the product, kept to what helps a student decide:
// material is the fabric blend of the color we sell (no fabric weight or construction terms).
// Leave it out until it is confirmed.
export const shopProducts = [
    {
        sku: "info-hoodie",
        name: "Hoodie",
        image: infoHoodie,
        material: "50/50 cotton/polyester",
    },
    {
        sku: "info-crewneck",
        name: "Crewneck",
        image: infoCrewneck,
        // Light Heather Grey; the supplier's Heather colors are 60/40 rather than the standard 65/35.
        material: "60/40 cotton/polyester",
    },
    {
        sku: "info-baseball-tee",
        name: "Baseball Tee",
        image: infoBaseballTee,
        // Sport Gray/Black; the supplier's Sport Gray colors are 90/10 rather than all cotton.
        material: "90/10 cotton/polyester",
    },
    {
        sku: "info-tote-bag",
        name: "Tote Bag",
        image: infoToteBag,
        material: "60/40 recycled cotton/polyester",
    },
];
