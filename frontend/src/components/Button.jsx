const Button = ({callback, text, type, className}) => {
    return (
      <button className={`${className}`} onClick={callback}>
        {text}
        {type === "right-arrow" ? <img className="right-arrow" src="/assets/right-arrow.svg" alt="right arrow" /> : "" }
      </button>
    );
  };

  export default Button;