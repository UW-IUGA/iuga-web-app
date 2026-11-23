/*
Purpose: The Resources page: Start Here links to the main iSchool resources beside the page title, then every
         resource, A–Z, beside a search and tag filter sidebar.

Expected Request Information:
- resources: the resource records (ResourcesData).
- The URL's ?q=, ?tags=, and the original page's ?category= (see useResourceFilters).

Expected Response Information:
- Searchable, tag-filtered resource cards, with fewer to a page on smaller screens.
*/

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { tagGroups } from "../assets/data/resourceTaxonomy";
import PageHeader from "../components/PageHeader";
import ResourceCard from "../components/ResourceCard";
import ResourcePagination from "../components/ResourcePagination";
import ResourceSearchBox from "../components/ResourceSearchBox";
import usePagination from "../hooks/usePagination";
import useResourceFilters from "../hooks/useResourceFilters";
import useResourcePageSize from "../hooks/useResourcePageSize";
import { pickStartHere } from "./resourceStartHere";

const INTRO = "IUGA is just one of many RSOs and groups affiliated with the iSchool that makes the iSchool "
    + "everything it is. Explore the resources below to take full advantage of everything the iSchool offers its "
    + "students! From academic and career resources to personal mental health, the iSchool community does its best "
    + "to support its students in every area it can.";

const resultLabel = (count) => `${count} ${count === 1 ? "resource" : "resources"}`;

// Keeps hyphenated words such as "Well-Being" on one line, so a Start Here name never breaks after the hyphen.
const keepHyphenatedWordsWhole = (name) => name
    .split(/(\S+-\S+)/)
    .map((part, index) => (
        index % 2 === 1 ? <span key={index} className="resources__keepOnOneLine">{part}</span> : part
    ));

function ResourcesPage({ resources }) {
    const startHere = useMemo(() => pickStartHere(resources), [resources]);
    const filters = useResourceFilters(resources);
    const {
        selectedTags, toggleTag, clearFilters, filteredResources, tagCounts, highlightPattern, isFiltering,
    } = filters;
    const [filtersOpen, setFiltersOpen] = useState(false);
    const pagination = usePagination(filteredResources, useResourcePageSize());
    const resultsHeadingRef = useRef(null);
    const resultsRef = useRef(null);
    const shownResources = useRef(filteredResources);

    // When the results change while the reader is scrolled into the cards, start the new results at the top of the
    // view, where the sticky sidebar sits; otherwise the shorter page snaps the scroll and jolts the sidebar.
    useLayoutEffect(() => {
        if (shownResources.current === filteredResources) return;
        shownResources.current = filteredResources;
        const results = resultsRef.current;
        if (!results) return;
        const sidebarStickyTop = parseFloat(getComputedStyle(results).scrollMarginTop);
        const offset = results.getBoundingClientRect().top - sidebarStickyTop;
        // Rounded up: rounding down would leave the sidebar a fraction of a pixel lower.
        if (offset < 0) window.scrollTo({ top: Math.ceil(window.scrollY + offset), behavior: "instant" });
    }, [filteredResources]);

    // Focus moves to the results heading so screen readers follow the page change.
    const goToPage = (page) => {
        pagination.setPage(page);
        resultsHeadingRef.current?.focus({ preventScroll: true });
        resultsHeadingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const startHereSection = startHere.length > 0 && (
        <section className="resources__startHere" aria-labelledby="resources-start-here">
            <p className="resources__startHereLabel">New to the iSchool?</p>
            <h2 id="resources-start-here">Start Here</h2>
            <ul className="resources__startList">
                {startHere.map((resource) => (
                    <li key={resource.rName}>
                        <a className="resources__startLink" href={resource.rLink} target="_blank" rel="noreferrer">
                            <span className="resourceIcon"><img src={resource.rImage} alt="" /></span>
                            <span>{keepHyphenatedWordsWhole(resource.rName)}</span>
                            <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );

    return (
        <div className="baseContainer">
            <main className="resources">
                <PageHeader title="Make the most of the iSchool." intro={INTRO} visual={startHereSection} />

                <section className="resources__directory" aria-labelledby="resources-all">
                    <div className="resources__resultsHeader">
                        <h2
                            className="resources__resultsTitle"
                            id="resources-all"
                            ref={resultsHeadingRef}
                            tabIndex={-1}
                        >
                            All Resources
                        </h2>
                        <p className="resources__resultCount" aria-live="polite">
                            {resultLabel(filteredResources.length)}
                            {selectedTags.length > 0 && ` · ${selectedTags.join(", ")}`}
                        </p>
                    </div>

                    <aside className="resources__sidebar editorial-card" aria-label="Filters">
                        <div className="resources__sidebarHeader">
                            <h2>Filters</h2>
                            <button
                                className="pill-button resources__filtersToggle"
                                type="button"
                                aria-expanded={filtersOpen}
                                aria-controls="resource-filter-groups"
                                onClick={() => setFiltersOpen((open) => !open)}
                            >
                                {filtersOpen ? "Hide" : "Show"}
                                {selectedTags.length > 0 && ` (${selectedTags.length})`}
                            </button>
                        </div>
                        <ResourceSearchBox
                            id="resource-search"
                            label="Search"
                            placeholder="Name, keyword, or tag"
                            filters={filters}
                        />
                        {/* Disabled rather than hidden when there is nothing to clear, so the filters never shift. */}
                        <button
                            className="resources__clearButton"
                            type="button"
                            onClick={clearFilters}
                            disabled={!isFiltering}
                        >
                            Clear All Filters
                        </button>
                        <div
                            className={`resources__filterGroups${filtersOpen ? " resources__filterGroups--open" : ""}`}
                            id="resource-filter-groups"
                        >
                            {tagGroups.map((group) => (
                                <fieldset key={group.label}>
                                    <legend>{group.label}</legend>
                                    {group.tags.map((tag) => (
                                        <label key={tag} className="resources__filterOption">
                                            <input
                                                type="checkbox"
                                                checked={selectedTags.includes(tag)}
                                                onChange={() => toggleTag(tag)}
                                            />
                                            <span className="resources__filterName">{tag}</span>
                                            <span className="resources__filterCount">{tagCounts[tag]}</span>
                                        </label>
                                    ))}
                                </fieldset>
                            ))}
                        </div>
                    </aside>

                    <div className="resources__resultsBody" ref={resultsRef}>
                        {filteredResources.length > 0 ? (
                            <>
                                <div className="resources__cardGrid">
                                    {pagination.pageItems.map((resource) => (
                                        <ResourceCard
                                            key={resource.rName}
                                            resource={resource}
                                            highlight={highlightPattern}
                                        />
                                    ))}
                                </div>
                                <ResourcePagination
                                    page={pagination.page}
                                    pageCount={pagination.pageCount}
                                    onPageChange={goToPage}
                                />
                            </>
                        ) : (
                            <div className="resources__emptyState editorial-card">
                                <h2>No resources match those filters.</h2>
                                <p>Some interest tags have no resources yet. Try another tag or clear your filters.</p>
                                <button className="pill-button pill-button--fill" type="button" onClick={clearFilters}>
                                    Clear All Filters
                                </button>
                            </div>
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
}

export default ResourcesPage;
