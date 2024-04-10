const DottedButton = ({callback, text}) => {
    return (
      <button className="primary-button" onClick={callback}>
        {text}
      </button>
    );
  };

  export default DottedButton;