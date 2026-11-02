import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import { useTheme } from "../utils/theme";

// The navbar's light/dark switch. On means dark. Its name stays "Dark theme"
// whichever way it is set, so a screen reader hears one control with a state,
// not a label that flips between the two themes.
export default function ThemeToggle() {
    const { theme, chooseTheme } = useTheme();
    const dark = theme === "dark";

    return (
        <button
            type="button"
            role="switch"
            aria-checked={dark}
            aria-label="Dark theme"
            className="themeToggle"
            onClick={() => chooseTheme(dark ? "light" : "dark")}
        >
            <span className="themeToggle__track" aria-hidden="true">
                <FontAwesomeIcon icon={faSun} className="themeToggle__icon themeToggle__icon--sun" />
                <FontAwesomeIcon icon={faMoon} className="themeToggle__icon themeToggle__icon--moon" />
                <span className="themeToggle__thumb" />
            </span>
        </button>
    );
}
