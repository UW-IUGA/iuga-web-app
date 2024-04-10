
const CharacterCard = ({ category }) => {
    return (
        <div className={`characterCard ${category}`}>
            <img src={`/assets/characters/${category}.svg`} alt={`${category} character`}></img>
            <div className={`characterCardBox`}>
                <span className="characterCardBackground"></span>
            </div>
        </div>
    );
};

export default CharacterCard;