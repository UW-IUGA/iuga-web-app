const Tag = ({text, style}) => {
    return (
      <div className={`${style.toLowerCase()}`}>
        <p className="tagText">{text}</p>
      </div>
    );
  };

  export default Tag;