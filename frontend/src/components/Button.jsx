const Button = ({callback, text, type, className, isDisabled}) => {
    return (
      <button className={`${className}`} onClick={callback} disabled={isDisabled}>
        {text}
        {type === "right-arrow" ? <img className="right-arrow" src="/assets/right-arrow.svg" alt="right arrow" /> : "" }
      </button>
    );
  };

  export default Button;