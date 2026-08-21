const Tag = ({text, type, isSmall}) => {
    return (
      <div className={`tag ${type.toLowerCase()}`}>
        <p className={`tagText category-pill${isSmall ? "-small" : ""} ${type.toLowerCase()}`}>{text}</p>
      </div>
    );
  };

  export default Tag;
