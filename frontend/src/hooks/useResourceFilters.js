/*
 * Purpose: Search, tag filtering, sorting, and search suggestions for the Resources page, kept in the URL.
 * Expected Request: useResourceFilters(resources) under a router, with resources that each carry `tags` and
 *   `highlights`. Reads ?q=, ?tags= (comma-separated), and ?sort=best|category|az; a legacy ?category= is read
 *   as its matching tag.
 * Expected Response: Filter state, setters, the matching resources in display order, per-tag match counts,
 *   a highlight pattern for the search words, and tag and resource suggestions for the search box.
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { allTags, searchSynonyms, tagForCategory, tagGroups } from "../assets/data/ResourceTagData";
import { buildHighlightPattern, scoreResource, textMatchesTokens, tokenize } from "../utils/resourceSearch";

export const SORT_BEST = "best";
export const SORT_DEFAULT = "category";
export const SORT_AZ = "az";
const SORT_ORDERS = [SORT_BEST, SORT_DEFAULT, SORT_AZ];

const MAX_TAG_SUGGESTIONS = 4;
const MAX_RESOURCE_SUGGESTIONS = 5;

const readTags = (searchParams) => {
    const tags = searchParams.get("tags");
    if (tags !== null) return tags.split(",").filter((tag) => allTags.includes(tag));
    const legacyTag = tagForCategory[searchParams.get("category")];
    return legacyTag ? [legacyTag] : [];
};

// Tags in the same group widen results (any of them); tags in different groups narrow them (each group must match).
const matchesTagGroups = (resource, selectedTags, skippedGroup) => tagGroups.every((group) => {
    if (group === skippedGroup) return true;
    const groupSelection = group.tags.filter((tag) => selectedTags.includes(tag));
    return groupSelection.length === 0 || groupSelection.some((tag) => resource.tags.includes(tag));
});

const compareNames = (first, second) =>
    first.rName.trim().localeCompare(second.rName.trim(), "en", { sensitivity: "base" });

const useResourceFilters = (resources) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const searchTerm = searchParams.get("q") ?? "";
    const selectedTags = useMemo(() => readTags(searchParams), [searchParams]);
    const tokens = useMemo(() => tokenize(searchTerm), [searchTerm]);
    const hasQuery = tokens.length > 0;

    // Without an explicit choice, searching sorts by best match and browsing keeps the category order.
    const automaticSort = hasQuery ? SORT_BEST : SORT_DEFAULT;
    const requestedSort = searchParams.get("sort");
    const sortOrder = SORT_ORDERS.includes(requestedSort) && (requestedSort !== SORT_BEST || hasQuery)
        ? requestedSort
        : automaticSort;
    const sortOptions = hasQuery ? SORT_ORDERS : [SORT_DEFAULT, SORT_AZ];

    // Every write re-saves the tags so a legacy ?category= is converted rather than lost.
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

    // Typing and sorting replace the history entry; tag changes push one so Back undoes them.
    const setSearchTerm = (value) => updateParams({ q: value }, { replace: true });
    const setSortOrder = (order) => updateParams({ sort: order === automaticSort ? "" : order }, { replace: true });
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

    const scoredMatches = useMemo(() => resources
        .map((resource) => ({ resource, score: hasQuery ? scoreResource(resource, tokens, searchSynonyms) : 0 }))
        .filter(({ score }) => !hasQuery || score > 0), [resources, tokens, hasQuery]);

    const filteredResources = useMemo(() => {
        const matches = scoredMatches.filter(({ resource }) => matchesTagGroups(resource, selectedTags));
        // Array.prototype.sort is stable, so equal scores keep the category order.
        if (sortOrder === SORT_BEST) matches.sort((first, second) => second.score - first.score);
        if (sortOrder === SORT_AZ) matches.sort((first, second) => compareNames(first.resource, second.resource));
        return matches.map(({ resource }) => resource);
    }, [scoredMatches, selectedTags, sortOrder]);

    // A tag's count is how many results there would be with it selected, given the other groups' selections.
    const tagCounts = useMemo(() => Object.fromEntries(tagGroups.flatMap((group) => group.tags.map((tag) => [
        tag,
        scoredMatches.filter(({ resource }) =>
            resource.tags.includes(tag) && matchesTagGroups(resource, selectedTags, group)
        ).length,
    ]))), [scoredMatches, selectedTags]);

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
        sortOrder,
        sortOptions,
        setSortOrder,
        filteredResources,
        tagCounts,
        highlightPattern,
        suggestions,
        isFiltering: hasQuery || selectedTags.length > 0,
    };
};

export default useResourceFilters;
