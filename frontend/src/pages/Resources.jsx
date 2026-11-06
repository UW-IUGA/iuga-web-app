/*
 * Purpose: The Resources page: Start Here cards for prominent iSchool resources beside the page title, then every
 *   resource beside a filter sidebar.
 * Expected Request: GET /resources, with `resources` grouped by category. Reads ?q=, ?tags=, ?sort=, and the
 *   legacy ?category=.
 * Expected Response: Searchable, tag-filtered resource cards, with fewer to a page on smaller screens.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../components/PageHeader";
import ResourceCard from "../components/ResourceCard";
import ResourcePagination from "../components/ResourcePagination";
import ResourceSearchBox from "../components/ResourceSearchBox";
import ResourceSort from "../components/ResourceSort";
import { pickStartHere, tagGroups, tagResources } from "../assets/data/ResourceTagData";
import usePagination from "../hooks/usePagination";
import useResourceFilters from "../hooks/useResourceFilters";
import useResourcePageSize from "../hooks/useResourcePageSize";

const resultLabel = (count) => `${count} ${count === 1 ? "resource" : "resources"}`;

// Kept from the original Resources page.
const INTRO = "IUGA is just one of many RSOs and groups affiliated with the iSchool that makes the iSchool everything it "
    + "is. Explore the resources below to take full advantage of everything the iSchool offers its students! From academic "
    + "and career resources to personal mental health, the iSchool community does its best to support its students in every "
    + "area it can.";

function ResourcesPage({ resources }) {
    const taggedResources = useMemo(() => tagResources(resources), [resources]);
    const startHere = useMemo(() => pickStartHere(taggedResources), [taggedResources]);
    const filters = useResourceFilters(taggedResources);
    const {
        selectedTags, toggleTag, clearFilters, sortOrder, sortOptions, setSortOrder,
        filteredResources, tagCounts, highlightPattern, isFiltering,
    } = filters;
    const [filtersOpen, setFiltersOpen] = useState(false);
    const pagination = usePagination(filteredResources, useResourcePageSize());
    const resultsHeadingRef = useRef(null);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    // A new page starts at the top of the results, with focus there so screen readers follow along.
    const goToPage = (page) => {
        pagination.setPage(page);
        resultsHeadingRef.current?.focus({ preventScroll: true });
        resultsHeadingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const startHereSection = startHere.length > 0 && (
        <section className="resourcesStartHere" aria-labelledby="resources-start-here">
            <p className="resourcesKicker">New to the iSchool?</p>
            <h2 id="resources-start-here">Start Here</h2>
            <ul className="resourcesStartList">
                {startHere.map((resource) => (
                    <li key={resource.rName}>
                        <a className="resourcesStartLink" href={resource.rLink} target="_blank" rel="noreferrer">
                            <span className="resourceCardIcon"><img src={resource.rImage} alt="" /></span>
                            <span>{resource.rName}</span>
                            <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );

    return (
        <div className="baseContainer">
            <main className="resourcesPage">
                <PageHeader
                    label="iSchool Resources"
                    title="Make the most of the iSchool."
                    intro={INTRO}
                    visual={startHereSection}
                />

                <div className="resourcesDirectory">
                    <aside className="resourcesSidebar editorial-card" aria-label="Filters">
                        <div className="resourcesSidebarHeader">
                            <h2>Filters</h2>
                            <button
                                className="pill-button resourcesFiltersToggle"
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
                            showLabel
                            placeholder="Name, keyword, or tag"
                            filters={filters}
                        />
                        <div
                            className={`resourcesFilterGroups${filtersOpen ? " resourcesFilterGroups--open" : ""}`}
                            id="resource-filter-groups"
                        >
                            {tagGroups.map((group) => (
                                <fieldset key={group.label}>
                                    <legend>{group.label}</legend>
                                    {group.tags.map((tag) => (
                                        <label key={tag} className="resourcesFilterOption">
                                            <input
                                                type="checkbox"
                                                checked={selectedTags.includes(tag)}
                                                onChange={() => toggleTag(tag)}
                                            />
                                            <span className="resourcesFilterName">{tag}</span>
                                            <span className="resourcesFilterCount">{tagCounts[tag]}</span>
                                        </label>
                                    ))}
                                </fieldset>
                            ))}
                        </div>
                        {isFiltering && (
                            <button className="resourcesClearButton" type="button" onClick={clearFilters}>Clear filters</button>
                        )}
                    </aside>

                    <section className="resourcesResults" aria-labelledby="resources-all">
                        <div className="resourcesResultsHeader">
                            <h2 className="resourcesResultsTitle" id="resources-all" ref={resultsHeadingRef} tabIndex={-1}>
                                All Resources
                            </h2>
                            <div className="resourceResultsMeta">
                                <p className="resourcesResultCount" aria-live="polite">
                                    {resultLabel(filteredResources.length)}
                                    {selectedTags.length > 0 && ` · ${selectedTags.join(", ")}`}
                                </p>
                                <ResourceSort id="resource-sort" sortOrder={sortOrder} sortOptions={sortOptions} onChange={setSortOrder} />
                            </div>
                        </div>
                        {filteredResources.length > 0 ? (
                            <>
                                <div className="resourceGrid">
                                    {pagination.pageItems.map((resource) => (
                                        <ResourceCard key={resource.rName} resource={resource} highlight={highlightPattern} />
                                    ))}
                                </div>
                                <ResourcePagination page={pagination.page} pageCount={pagination.pageCount} onPageChange={goToPage} />
                            </>
                        ) : (
                            <div className="resourcesEmptyState editorial-card">
                                <h2>No resources match those filters.</h2>
                                <p>Some interest tags have no resources yet. Try another tag or clear your filters.</p>
                                <button className="pill-button" type="button" onClick={clearFilters}>Clear filters</button>
                            </div>
                        )}
                    </section>
                </div>
            </main>
        </div>
    );
}

export default ResourcesPage;
