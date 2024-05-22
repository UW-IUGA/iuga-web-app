const Tag = ({text, type, isSmall}) => {
    return (
      <div className={`tag${isSmall ? "-small" : ""} ${type.toLowerCase()}`}>
        <p className="tagText">{text}</p>
      </div>
    );
  };

  export default Tag;