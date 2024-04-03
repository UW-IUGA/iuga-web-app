const DottedButton = ({callback, text}) => {
    return (
      <button onClick={callback}>
        {text}
      </button>
    );
  };

  export default DottedButton;