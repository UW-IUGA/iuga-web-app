/*
Purpose: The Resources page's filter groups: one fieldset of tag checkboxes, each with its result count, per group,
         under a name that folds the group.

Expected Request Information:
- selectedTags: the tags that are on.
- tagCounts: how many results each tag would give (useResourceFilters).
- onToggleTag(tag): turns a tag on or off.

Expected Response Information:
- The groups in tagGroups order. Who runs it and Club area start open. A group opens once one of its tags is on,
  whether by its box, a link or a search suggestion, and stays open after it is unticked, so the filter is always in
  view. Only a group with nothing on can fold.
*/

import { useState } from "react";
import { tagGroups } from "../assets/data/resourceTaxonomy";

const INITIALLY_OPEN = ["Who runs it", "Club area"];

function ResourceFilterGroups({ selectedTags, tagCounts, onToggleTag }) {
    const [openGroups, setOpenGroups] = useState(INITIALLY_OPEN);
    const [tagsSeen, setTagsSeen] = useState(null);
    const hasSelection = (group) => group.tags.some((tag) => selectedTags.includes(tag));

    // Opened during render rather than in an effect, so a group is never drawn folded around a filter that is on.
    if (tagsSeen !== selectedTags) {
        setTagsSeen(selectedTags);
        const picked = tagGroups.filter((group) => hasSelection(group) && !openGroups.includes(group.label));
        if (picked.length > 0) setOpenGroups([...openGroups, ...picked.map((group) => group.label)]);
    }

    const toggleGroup = (group) => {
        if (hasSelection(group)) return;
        setOpenGroups((open) => (open.includes(group.label)
            ? open.filter((label) => label !== group.label)
            : [...open, group.label]));
    };

    return tagGroups.map((group) => {
        const open = openGroups.includes(group.label);
        const optionsId = `resource-filters-${group.label.replace(/\W+/g, "-")}`;
        return (
            <fieldset key={group.label}>
                <legend>
                    <button
                        className="resources__groupToggle"
                        type="button"
                        aria-expanded={open}
                        aria-controls={optionsId}
                        onClick={() => toggleGroup(group)}
                    >
                        {group.label}
                    </button>
                </legend>
                <div id={optionsId} hidden={!open}>
                    {group.tags.map((tag) => (
                        <label key={tag} className="resources__filterOption">
                            <input
                                type="checkbox"
                                checked={selectedTags.includes(tag)}
                                onChange={() => onToggleTag(tag)}
                            />
                            <span className="resources__filterName">{tag}</span>
                            <span className="resources__filterCount">{tagCounts[tag]}</span>
                        </label>
                    ))}
                </div>
            </fieldset>
        );
    });
}

export default ResourceFilterGroups;
