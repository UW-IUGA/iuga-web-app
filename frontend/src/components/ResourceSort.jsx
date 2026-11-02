import { SORT_AZ, SORT_BEST, SORT_DEFAULT } from "../hooks/useResourceFilters";

const SORT_LABELS = {
    [SORT_BEST]: "Best match",
    [SORT_DEFAULT]: "By category",
    [SORT_AZ]: "A–Z",
};

const ResourceSort = ({ id, sortOrder, sortOptions, onChange }) => (
    <label className="resourceSort" htmlFor={id}>
        <span>Sort</span>
        <select id={id} value={sortOrder} onChange={(event) => onChange(event.target.value)}>
            {sortOptions.map((order) => <option key={order} value={order}>{SORT_LABELS[order]}</option>)}
        </select>
    </label>
);

export default ResourceSort;
