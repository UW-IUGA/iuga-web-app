const Button = ({callback, text, style}) => {
    return (
      <button className="primary-button" onClick={callback}>
        {text}
        {style === "right-arrow" ? <img className="right-arrow" src="/assets/right-arrow.svg" alt="right arrow" /> : "" }
      </button>
    );
  };

  export default Button;