import {
    prototypeDirection,
    prototypeEnterAnimation,
    prototypeTransitionVersion,
    resetPrototypeTransitionVersion,
} from "./prototypePageTransitions";

afterEach(() => resetPrototypeTransitionVersion());

it("reads the version from the opened page and keeps it for later pages", () => {
    expect(prototypeTransitionVersion("?v=3")).toBe(3);
    expect(prototypeTransitionVersion("")).toBe(3);
});

it("treats a missing or unknown version as the site without transitions", () => {
    expect(prototypeTransitionVersion("")).toBe(0);
    resetPrototypeTransitionVersion();
    expect(prototypeTransitionVersion("?v=9")).toBe(0);
});

it("slides by navbar order, and only fades between unrelated pages", () => {
    expect(prototypeDirection("/", "/events")).toBe(1);
    expect(prototypeDirection("/shop", "/resources")).toBe(-1);
    expect(prototypeDirection("/shop/checkout/abc", "/about")).toBe(1);
    expect(prototypeDirection("/events", "/elections")).toBe(0);
    expect(prototypeEnterAnimation("slide", 0)).toEqual(prototypeEnterAnimation("fade"));
});

it("keeps every entrance between 150 and 300 milliseconds", () => {
    for (const kind of ["fade", "rise", "slide"]) {
        const { duration } = prototypeEnterAnimation(kind, 1).options;
        expect(duration).toBeGreaterThanOrEqual(150);
        expect(duration).toBeLessThanOrEqual(300);
    }
});
