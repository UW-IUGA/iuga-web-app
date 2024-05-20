const Tag = ({text, style, isSmall}) => {
    return (
      <div className={`tag${isSmall ? "-small" : ""} ${style.toLowerCase()}`}>
        <p className="tagText">{text}</p>
      </div>
    );
  };

  export default Tag;