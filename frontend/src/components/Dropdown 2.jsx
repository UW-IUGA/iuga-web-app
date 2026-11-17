import { useEffect, useState, useRef, useCallback } from "react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCaretDown } from '@fortawesome/free-solid-svg-icons';

const Dropdown = ({ options, defaultOption, onSelect }) => {
    const wrapperRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(defaultOption || options[0]);

    const toggleDropdown = useCallback(() => {
        setIsOpen(!isOpen);
    }, [isOpen]);

    const handleItemClick = (item) => {
        setSelectedItem(item);
        onSelect(item);
        setIsOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = event => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        const timer = setTimeout(() => {
            document.addEventListener("click", handleClickOutside);
        }, 0);


        return () => {
            clearTimeout(timer);
            document.removeEventListener("click", handleClickOutside);
        };
    }, [toggleDropdown]);

    return (
        <div className="dropdown-container" ref={wrapperRef}>
            <div className="dropdown-trigger" onClick={toggleDropdown}>
                <span>{selectedItem}</span>
                <FontAwesomeIcon className={isOpen ? "dropdown-icon-rotate" : ""} size="xs" icon={faCaretDown} />
            </div>
            {isOpen && (
                <div className="dropdown-content">
                    {options.map((item) => (
                        <div key={item} className="dropdown-item" onClick={() => handleItemClick(item)}>
                            {item}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Dropdown;
