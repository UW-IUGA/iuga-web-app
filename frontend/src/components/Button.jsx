const Button = ({callback, text, type, color}) => {
    return (
      <button className={color} onClick={callback}>
        {text}
        {type === "right-arrow" ? <img className="right-arrow" src="/assets/right-arrow.svg" alt="right arrow" /> : "" }
      </button>
    );
  };

  export default Button;