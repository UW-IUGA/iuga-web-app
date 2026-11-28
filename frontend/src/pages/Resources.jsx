import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ResourceCard from "../components/ResourceCard";
import { resourceTagTones, resourceTags } from "../assets/data/Enum";
import PageHeader from "../components/PageHeader";

const ALL_RESOURCES = "All resources";
const categories = Object.values(resourceTags);

const categoryId = (category) =>
    `resource-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;

function ResourcesPage({ resources }) {
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedCategory = searchParams.get("category");
    const initialCategory = categories.includes(requestedCategory) ? requestedCategory : ALL_RESOURCES;
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState(initialCategory);
    const [collapsedCategories, setCollapsedCategories] = useState(new Set());

    useEffect(() => {
        setSelectedCategory(initialCategory);
    }, [initialCategory]);

    const selectCategory = (category) => {
        setSelectedCategory(category);
        setSearchParams((currentParams) => {
            const nextParams = new URLSearchParams(currentParams);
            if (category === ALL_RESOURCES) {
                nextParams.delete("category");
            } else {
                nextParams.set("category", category);
            }
            return nextParams;
        }, { replace: true });
    };

    const visibleCategories = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();

        return categories.reduce((filteredCategories, category) => {
            if (selectedCategory !== ALL_RESOURCES && selectedCategory !== category) {
                return filteredCategories;
            }

            const matchingResources = (resources[category] || []).filter((resource) => {
                const searchableText = `${category} ${resource.rName} ${resource.rDescription}`.toLowerCase();
                return searchableText.includes(normalizedSearch);
            });

            if (matchingResources.length > 0) {
                filteredCategories.push({ category, items: matchingResources });
            }

            return filteredCategories;
        }, []);
    }, [resources, searchTerm, selectedCategory]);

    const resultCount = visibleCategories.reduce((count, category) => count + category.items.length, 0);
    const isFiltering = searchTerm.trim().length > 0 || selectedCategory !== ALL_RESOURCES;

    // Every section starts open. Picking a category, or starting or clearing a
    // search, reopens any the visitor closed.
    useEffect(() => {
        setCollapsedCategories(new Set());
    }, [isFiltering, selectedCategory]);

    const isOpen = (category) => !collapsedCategories.has(category);

    const toggleCategory = (category) => {
        setCollapsedCategories((collapsed) => {
            const nextCollapsed = new Set(collapsed);
            if (nextCollapsed.has(category)) {
                nextCollapsed.delete(category);
            } else {
                nextCollapsed.add(category);
            }
            return nextCollapsed;
        });
    };

    return (
        <div className="baseContainer">
            <main className="resourcesPage">
                <PageHeader
                    title="Find support at the iSchool and UW."
                    intro="Academic, career, wellbeing, and community resources, plus student organizations. Each is run by its own group, not IUGA."
                />

                <section className="resourcesDirectory" aria-label="Resource directory">
                    <div className="resourcesControls editorial-card">
                        <label className="resourcesSearch" htmlFor="resource-search">
                            <span>Search resources</span>
                            <input
                                id="resource-search"
                                type="search"
                                placeholder="Try “tutoring,” “career,” or “community”"
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                            />
                        </label>
                        <div className="resourceFilters" role="group" aria-labelledby="resource-filter-label">
                            <span className="resourceFilters__label" id="resource-filter-label">Filter by category</span>
                            {[ALL_RESOURCES, ...categories].map((category) => (
                                <button
                                    key={category}
                                    className="pill-button"
                                    type="button"
                                    data-tone={resourceTagTones[category]}
                                    aria-pressed={selectedCategory === category}
                                    onClick={() => selectCategory(category)}
                                >
                                    {category}
                                </button>
                            ))}
                        </div>
                    </div>

                    <p className="resourceResultCount" aria-live="polite">
                        {resultCount} {resultCount === 1 ? "resource" : "resources"} found
                    </p>

                    {visibleCategories.length > 0 ? (
                        <div className="resourceCategoryList">
                            {visibleCategories.map(({ category, items }) => (
                                <section className="resourceCategory" id={categoryId(category)} key={category}>
                                    <div className="resourceCategoryHeader">
                                        <h2>
                                            <button
                                                type="button"
                                                className="resourceCategoryToggle"
                                                aria-expanded={isOpen(category)}
                                                aria-controls={`${categoryId(category)}-panel`}
                                                aria-label={`${isOpen(category) ? "Hide" : "Show"} ${category}`}
                                                onClick={() => toggleCategory(category)}
                                            >
                                                <span>{category}</span>
                                                <span className="resourceCategoryMeta">
                                                    {isFiltering && (
                                                        <span className="resourceCategoryCount">
                                                            {items.length} {items.length === 1 ? "match" : "matches"}
                                                        </span>
                                                    )}
                                                    <span className="resourceCategoryChevron" aria-hidden="true" />
                                                </span>
                                            </button>
                                        </h2>
                                    </div>
                                    {isOpen(category) && (
                                        <div className="resourceGrid" id={`${categoryId(category)}-panel`}>
                                            {items.map((resource) => (
                                                <ResourceCard key={resource.rName} resource={resource} category={category} />
                                            ))}
                                        </div>
                                    )}
                                </section>
                            ))}
                        </div>
                    ) : (
                        <div className="resourcesEmptyState editorial-card">
                            <h2>No resources match that search.</h2>
                            <p>Try a broader term or return to all resources.</p>
                            <button className="pill-button pill-button--fill" type="button" onClick={() => {
                                setSearchTerm("");
                                setSelectedCategory(ALL_RESOURCES);
                            }}>
                                Show all resources
                            </button>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}

export default ResourcesPage;
