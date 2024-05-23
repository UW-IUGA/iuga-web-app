import { useState } from "react";

const Dropdown = ({ options, defaultOption, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(defaultOption || options[0]);

    const toggleDropdown = () => {
        setIsOpen(!isOpen);
    };

    const handleItemClick = (item) => {
        setSelectedItem(item);
        onSelect(item);
        setIsOpen(false);
    };

    return (
        <div className="dropdown-container">
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
