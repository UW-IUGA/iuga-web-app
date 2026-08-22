import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import ResourceCard from "../components/ResourceCard";
import { resourceTags } from "../assets/data/Enum";

const ALL_RESOURCES = "All resources";
const categories = Object.values(resourceTags);

const categoryId = (category) =>
    `resource-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;

function ResourcesPage({ resources }) {
    const { pathname } = useLocation();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState(ALL_RESOURCES);
    const [expandedCategories, setExpandedCategories] = useState(new Set());
    const [collapsedFilteredCategories, setCollapsedFilteredCategories] = useState(new Set());

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

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

    useEffect(() => {
        setCollapsedFilteredCategories(new Set());
    }, [isFiltering]);

    const toggleCategory = (category) => {
        if (isFiltering) {
            setCollapsedFilteredCategories((collapsed) => {
                const nextCollapsed = new Set(collapsed);
                if (nextCollapsed.has(category)) {
                    nextCollapsed.delete(category);
                } else {
                    nextCollapsed.add(category);
                }
                return nextCollapsed;
            });
            return;
        }

        setExpandedCategories((expanded) => {
            const nextExpanded = new Set(expanded);
            if (nextExpanded.has(category)) {
                nextExpanded.delete(category);
            } else {
                nextExpanded.add(category);
            }
            return nextExpanded;
        });
    };

    return (
        <div className="baseContainer">
            <main className="resourcesPage">
                <section className="resourcesHero" aria-labelledby="resources-title">
                    <div className="resourcesHeroCopy">
                        <p className="resourcesKicker">IUGA student guide</p>
                        <h1 id="resources-title">Resources</h1>
                        <p>
                            IUGA is just one of many RSOs and groups affiliated with the iSchool that makes the iSchool everything it is.
                            Explore the resources below to take full advantage of everything the iSchool offers its students! From academic and
                            career resources to personal mental health, the iSchool community does its best to support its students in every area it can.
                        </p>
                    </div>
                </section>

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
                        <div className="resourceFilters" aria-label="Filter resources by category">
                            {[ALL_RESOURCES, ...categories].map((category) => (
                                <button
                                    key={category}
                                    className="pill-button"
                                    type="button"
                                    aria-pressed={selectedCategory === category}
                                    onClick={() => setSelectedCategory(category)}
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
                                                aria-expanded={isFiltering ? !collapsedFilteredCategories.has(category) : expandedCategories.has(category)}
                                                aria-controls={`${categoryId(category)}-panel`}
                                                aria-label={`${(isFiltering ? !collapsedFilteredCategories.has(category) : expandedCategories.has(category)) ? "Hide" : "Show"} ${category}`}
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
                                    {(isFiltering ? !collapsedFilteredCategories.has(category) : expandedCategories.has(category)) && (
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
                            <button className="pill-button" type="button" onClick={() => {
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
