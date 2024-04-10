import CharacterCard from "../components/CharacterCard";

function HomePage() {
    const categories = ["Academic", "Social", "Career"];

    return (
        <div className="baseContainer">
            <div className="introduction">
                <h1>Informatics <br/> Undergraduate Association</h1>
                <p>IUGA is a student-led RSO that communicates between the Informatics student body, faculty, and administration of the University of Washington Information School.</p>
                <div className="characterCardContainer">
                    { categories.map(category => {
                        return <CharacterCard key={category} category={category} />;
                    })}
                </div>
            </div>
        </div>
    )
}
  
export default HomePage;
  