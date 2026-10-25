/*
Purpose: The shared top of every page, so each page introduces itself the same way.

Expected Request Information:
- label: the page's name as it appears in the navigation.
- title: what a student can do on this page; it becomes the page's only main heading.
- intro: optional one or two sentences shown under the title.
- children: optional page actions shown under the intro.
- visual: optional real photo or illustration shown beside the text on wide screens.

Expected Response Information:
- A region named by the title, holding the label, title, intro, actions, and visual.
*/
import { useId } from "react";

function PageHeader({ label, title, intro, children, visual }) {
    const titleId = useId();

    return (
        <section className={`pageHeader${visual ? " pageHeader--withVisual" : ""}`} aria-labelledby={titleId}>
            <div className="pageHeader__text">
                <p className="pageHeader__label">{label}</p>
                <h1 id={titleId}>{title}</h1>
                {intro && <p className="pageHeader__intro">{intro}</p>}
                {children && <div className="pageHeader__actions">{children}</div>}
            </div>
            {visual && <div className="pageHeader__visual">{visual}</div>}
        </section>
    );
}

export default PageHeader;
