import PropTypes from "prop-types";

const GradientLine = ({ className = "" }) => {
    return <div className={`gradient-line ${className}`}></div>;
};

GradientLine.propTypes = {
    className: PropTypes.string,
};

export default GradientLine;
