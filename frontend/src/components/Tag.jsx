const Tag = ({text, style}) => {
    return (
      <div className={`tag ${style.toLowerCase()}`}>
        <p className="tagText">{text}</p>
      </div>
    );
  };

  export default Tag;