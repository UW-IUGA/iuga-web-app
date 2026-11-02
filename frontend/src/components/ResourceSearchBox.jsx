/*
 * Purpose: Search box for the resources pages that doubles as the way into the tag filters.
 * Expected Request: An id and label, plus `filters`, the object returned by useResourceFilters.
 * Expected Response: A combobox with the selected tags as removable chips and a suggestion list of matching
 *   tags (applied as filters) and resource names (searched for), usable with the keyboard.
 */
import { Fragment, useState } from "react";
import HighlightMatch from "./HighlightMatch";

const GROUP_LABELS = {
    tag: "Filter by tag",
    resource: "Resources",
};

const ResourceSearchBox = ({ id, label, showLabel = false, placeholder, className = "", filters }) => {
    const {
        searchTerm, setSearchTerm, selectedTags, toggleTag, suggestions, applyTagSuggestion, applyResourceSuggestion,
        highlightPattern,
    } = filters;
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);

    const options = [
        ...suggestions.tags.map((tag) => ({ kind: "tag", key: `tag-${tag}`, tag })),
        ...suggestions.resources.map((resource) => ({ kind: "resource", key: `resource-${resource.rName}`, resource })),
    ];
    const listboxId = `${id}-suggestions`;
    const expanded = open && options.length > 0;
    const optionId = (index) => `${id}-option-${index}`;

    const choose = (option) => {
        if (option.kind === "tag") {
            applyTagSuggestion(option.tag);
        } else {
            applyResourceSuggestion(option.resource);
        }
        setOpen(false);
        setActiveIndex(-1);
    };

    const moveActive = (step) => {
        setOpen(true);
        setActiveIndex((index) => {
            if (index < 0) return step > 0 ? 0 : options.length - 1;
            return (index + step + options.length) % options.length;
        });
    };

    const handleKeyDown = (event) => {
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && options.length > 0) {
            event.preventDefault();
            moveActive(event.key === "ArrowDown" ? 1 : -1);
        } else if (event.key === "Enter" && expanded && activeIndex >= 0) {
            event.preventDefault();
            choose(options[activeIndex]);
        } else if (event.key === "Escape") {
            setOpen(false);
            setActiveIndex(-1);
        } else if (event.key === "Backspace" && searchTerm === "" && selectedTags.length > 0) {
            toggleTag(selectedTags[selectedTags.length - 1]);
        }
    };

    return (
        <div className={`resourceSearchBox ${className}`.trim()}>
            <label className={showLabel ? "resourceSearchLabel" : "sr-only"} htmlFor={id}>{label}</label>
            <div className="resourceSearchField">
                {selectedTags.map((tag) => (
                    <span className="resourceSearchChip" key={tag}>
                        {tag}
                        <button type="button" aria-label={`Remove ${tag} filter`} onClick={() => toggleTag(tag)}>×</button>
                    </span>
                ))}
                <input
                    id={id}
                    type="search"
                    role="combobox"
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-expanded={expanded}
                    aria-controls={listboxId}
                    aria-activedescendant={expanded && activeIndex >= 0 ? optionId(activeIndex) : undefined}
                    placeholder={selectedTags.length > 0 ? "Search within these filters" : placeholder}
                    value={searchTerm}
                    onChange={(event) => {
                        setSearchTerm(event.target.value);
                        setOpen(true);
                        setActiveIndex(-1);
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setOpen(false)}
                    onKeyDown={handleKeyDown}
                />
            </div>
            {expanded && (
                <ul className="resourceSearchSuggestions" id={listboxId} role="listbox" aria-label={`${label} suggestions`}>
                    {options.map((option, index) => (
                        <Fragment key={option.key}>
                            {(index === 0 || options[index - 1].kind !== option.kind) && (
                                <li className="resourceSearchGroupLabel" role="presentation">{GROUP_LABELS[option.kind]}</li>
                            )}
                            <li
                                id={optionId(index)}
                                className="resourceSearchOption"
                                role="option"
                                aria-selected={index === activeIndex}
                                // Keeps focus in the input so its blur does not close the list before the click lands.
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => choose(option)}
                            >
                                {option.kind === "tag" ? (
                                    <>
                                        <span className="resourceSearchOptionTag">
                                            <HighlightMatch text={option.tag} pattern={highlightPattern} />
                                        </span>
                                        <span className="resourceSearchOptionHint">Add filter</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="resourceCardIcon" aria-hidden="true">
                                            {option.resource.rImage
                                                ? <img src={option.resource.rImage} alt="" />
                                                : option.resource.rName.charAt(0)}
                                        </span>
                                        <span><HighlightMatch text={option.resource.rName} pattern={highlightPattern} /></span>
                                    </>
                                )}
                            </li>
                        </Fragment>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default ResourceSearchBox;
