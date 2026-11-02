// Previous and Next around "Page 1 of 2"; nothing when everything fits on one page.
const ResourcePagination = ({ page, pageCount, onPageChange }) => {
    if (pageCount <= 1) return null;

    return (
        <nav className="resourcePagination" aria-label="Resource pages">
            <button className="pill-button resourcePaginationButton" type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
                <span aria-hidden="true">←</span> Previous
            </button>
            <p>Page <strong>{page}</strong> of <strong>{pageCount}</strong></p>
            <button className="pill-button resourcePaginationButton" type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
                Next <span aria-hidden="true">→</span>
            </button>
        </nav>
    );
};

export default ResourcePagination;
