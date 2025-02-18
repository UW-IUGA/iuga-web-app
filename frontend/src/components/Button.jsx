const Button = ({onClick, text, type, link, className, isDisabled}) => {

  const handleClick = () => {
    if (link) {
      window.open(link, "_blank");
    } else if (onClick) {
      onClick();
    }
  };

    return (
      <button className={`${className}`} onClick={handleClick} disabled={isDisabled}>
        {text}
        {type === "right-arrow" ? (
          <img className="right-arrow" src="/assets/right-arrow.svg" alt="right arrow" />
      ) : null}
      </button>
    );
  };

  export default Button;