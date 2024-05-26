import { useEffect, useState, useRef, useCallback } from "react";

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
                toggleDropdown();
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
                {selectedItem}
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
