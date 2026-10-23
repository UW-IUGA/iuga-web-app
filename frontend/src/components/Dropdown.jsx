import { useState } from "react";

const Dropdown = ({ options, defaultOption, onSelect, label }) => {
    const [selectedItem, setSelectedItem] = useState(defaultOption || options[0]);

    return (
        <div className="dropdown-container">
            <select className="dropdown-trigger" aria-label={label} value={selectedItem} onChange={(event) => {
                setSelectedItem(event.target.value);
                onSelect(event.target.value);
            }}>
                {options.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
        </div>
    );
};

export default Dropdown;
