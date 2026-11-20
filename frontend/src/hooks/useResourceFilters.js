/*
Purpose: Search, tag filtering, and search suggestions for the Resources page, kept in the URL so a filtered
         view can be shared or reloaded.

Expected Request Information:
- resources: tagged resources (from tagResources), each with `tags` and `highlights`.
- The URL's ?q= and ?tags= (comma-separated), or the original page's ?category=, read as its matching tag.

Expected Response Information:
- The search text, selected tags, and setters for both.
- filteredResources: the matching resources in A–Z order.
- tagCounts: how many results each tag would give.
- highlightPattern for marking the search words, and suggestions for the search box.
*/

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { allTags, searchSynonyms, tagForCategory, tagGroups } from "../assets/data/ResourceTagData";
import { buildHighlightPattern, resourceMatchesTokens, textMatchesTokens, tokenize } from "../utils/resourceSearch";

const MAX_TAG_SUGGESTIONS = 4;
const MAX_RESOURCE_SUGGESTIONS = 5;

function readTags(searchParams) {
    const tags = searchParams.get("tags");
    if (tags !== null) return tags.split(",").filter((tag) => allTags.includes(tag));
    const categoryTag = tagForCategory[searchParams.get("category")];
    return categoryTag ? [categoryTag] : [];
}

// Tags in the same group widen results (any of them); tags in different groups narrow them (each group must match).
function matchesTagGroups(resource, selectedTags, skippedGroup) {
    return tagGroups.every((group) => {
        if (group === skippedGroup) return true;
        const groupSelection = group.tags.filter((tag) => selectedTags.includes(tag));
        return groupSelection.length === 0 || groupSelection.some((tag) => resource.tags.includes(tag));
    });
}

const compareNames = (first, second) =>
    first.rName.trim().localeCompare(second.rName.trim(), "en", { sensitivity: "base" });

export default function useResourceFilters(resources) {
    const [searchParams, setSearchParams] = useSearchParams();
    const searchTerm = searchParams.get("q") ?? "";
    const selectedTags = useMemo(() => readTags(searchParams), [searchParams]);
    const tokens = useMemo(() => tokenize(searchTerm), [searchTerm]);
    const hasQuery = tokens.length > 0;

    // Every write re-saves the tags, so a ?category= link becomes a ?tags= one instead of losing its filter.
    const updateParams = (changes, options) => {
        setSearchParams((currentParams) => {
            const nextParams = new URLSearchParams(currentParams);
            nextParams.delete("category");
            Object.entries({ tags: selectedTags.join(","), ...changes }).forEach(([key, value]) => {
                if (value) {
                    nextParams.set(key, value);
                } else {
                    nextParams.delete(key);
                }
            });
            return nextParams;
        }, options);
    };

    // Typing replaces the history entry; tag changes push one so Back undoes them.
    const setSearchTerm = (value) => updateParams({ q: value }, { replace: true });
    const clearFilters = () => updateParams({ q: "", tags: "" });
    const toggleTag = (tag) => {
        const nextTags = selectedTags.includes(tag)
            ? selectedTags.filter((selected) => selected !== tag)
            : [...selectedTags, tag];
        updateParams({ tags: nextTags.join(",") });
    };
    // Picking a suggested tag turns the typed words into that filter.
    const applyTagSuggestion = (tag) => updateParams({ q: "", tags: [...selectedTags, tag].join(",") });
    const applyResourceSuggestion = (resource) => updateParams({ q: resource.rName.trim() });

    const resourcesMatchingSearch = useMemo(() => {
        if (!hasQuery) return resources;
        return resources.filter((resource) => resourceMatchesTokens(resource, tokens, searchSynonyms));
    }, [resources, tokens, hasQuery]);

    const filteredResources = useMemo(
        () => resourcesMatchingSearch.filter((resource) => matchesTagGroups(resource, selectedTags)).sort(compareNames),
        [resourcesMatchingSearch, selectedTags]
    );

    // A tag's count is how many results there would be with it selected, given the other groups' selections.
    const tagCounts = useMemo(() => Object.fromEntries(tagGroups.flatMap((group) => group.tags.map((tag) => {
        const resultsWithTag = resourcesMatchingSearch.filter((resource) =>
            resource.tags.includes(tag) && matchesTagGroups(resource, selectedTags, group)).length;
        return [tag, resultsWithTag];
    }))), [resourcesMatchingSearch, selectedTags]);

    const highlightPattern = useMemo(() => buildHighlightPattern(tokens, searchSynonyms), [tokens]);

    // Only resources already in the results are suggested, so picking one always shows it.
    const suggestions = useMemo(() => ({
        tags: hasQuery
            ? allTags
                .filter((tag) => !selectedTags.includes(tag) && textMatchesTokens(tag, tokens, searchSynonyms))
                .slice(0, MAX_TAG_SUGGESTIONS)
            : [],
        resources: hasQuery
            ? filteredResources
                .filter((resource) => textMatchesTokens(resource.rName, tokens, searchSynonyms))
                .slice(0, MAX_RESOURCE_SUGGESTIONS)
            : [],
    }), [hasQuery, tokens, selectedTags, filteredResources]);

    return {
        searchTerm,
        setSearchTerm,
        selectedTags,
        toggleTag,
        clearFilters,
        applyTagSuggestion,
        applyResourceSuggestion,
        filteredResources,
        tagCounts,
        highlightPattern,
        suggestions,
        isFiltering: hasQuery || selectedTags.length > 0,
    };
}
