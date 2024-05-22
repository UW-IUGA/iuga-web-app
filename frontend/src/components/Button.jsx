const Button = ({onClick, text, type, className, isDisabled}) => {
    return (
      <button className={`${className}`} onClick={onClick} disabled={isDisabled}>
        {text}
        {type === "right-arrow" ? <img className="right-arrow" src="/assets/right-arrow.svg" alt="right arrow" /> : "" }
      </button>
    );
  };

  export default Button;