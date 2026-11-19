/*
 * Purpose: Search, tag filtering, and search suggestions for the Resources page, kept in the URL.
 * Expected Request: useResourceFilters(resources) under a router, with resources that each carry `tags` and
 *   `highlights`. Reads ?q= and ?tags= (comma-separated); a legacy ?category= is read as its matching tag.
 * Expected Response: Filter state, setters, the matching resources in A–Z order, per-tag match counts,
 *   a highlight pattern for the search words, and tag and resource suggestions for the search box.
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { allTags, renamedTags, searchSynonyms, tagForCategory, tagGroups } from "../assets/data/ResourceTagData";
import { buildHighlightPattern, scoreResource, textMatchesTokens, tokenize } from "../utils/resourceSearch";

const MAX_TAG_SUGGESTIONS = 4;
const MAX_RESOURCE_SUGGESTIONS = 5;

const readTags = (searchParams) => {
    const tags = searchParams.get("tags");
    if (tags !== null) {
        return tags.split(",").map((tag) => renamedTags[tag] ?? tag).filter((tag) => allTags.includes(tag));
    }
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

    // Every write re-saves the tags so a legacy ?category= is converted rather than lost. A ?sort= from an older
    // link is dropped, since results are always A–Z.
    const updateParams = (changes, options) => {
        setSearchParams((currentParams) => {
            const nextParams = new URLSearchParams(currentParams);
            nextParams.delete("category");
            nextParams.delete("sort");
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

    const scoredMatches = useMemo(() => resources
        .map((resource) => ({ resource, score: hasQuery ? scoreResource(resource, tokens, searchSynonyms) : 0 }))
        .filter(({ score }) => !hasQuery || score > 0), [resources, tokens, hasQuery]);

    // Results are always A–Z, whether browsing, filtering, or searching.
    const filteredResources = useMemo(() => scoredMatches
        .filter(({ resource }) => matchesTagGroups(resource, selectedTags))
        .map(({ resource }) => resource)
        .sort(compareNames), [scoredMatches, selectedTags]);

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
        filteredResources,
        tagCounts,
        highlightPattern,
        suggestions,
        isFiltering: hasQuery || selectedTags.length > 0,
    };
};

export default useResourceFilters;
