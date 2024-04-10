
const CharacterCard = ({ category }) => {
    let description = '';

    if (category.toLowerCase() === 'academic') {
        description = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod.';
    } else if (category.toLowerCase() === 'social') {
        description = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod.';
    } else if (category.toLowerCase() === 'career') {
        description = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod.';
    }

    return (
        <div className={`characterCard ${category.toLowerCase()}`}>
            <img src={`/assets/characters/${category.toLowerCase()}.svg`} alt={`${category} character`}></img>
            <div className={`characterCardBox`}>
                <span className="characterCardBackground"></span>
                <div className="characterCardHeader">
                    <div></div>
                    <h1>{category}</h1>
                </div>
                <div className="characterCardBody">
                    <p>{description}</p>
                    <button>{category} Events →</button>
                </div>
            </div>
        </div>
    );
};

export default CharacterCard;