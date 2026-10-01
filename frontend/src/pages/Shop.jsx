import { shopProducts } from "../assets/data/ShopData";

const shopAvailability = "Available Fall 2026";

function ShopPage({ products = shopProducts }) {
    return (
        <div className="baseContainer">
            <main className="shopPage">
                <section className="shopPage__hero" aria-labelledby="shop-title">
                    <p className="shopPage__kicker">IUGA collection</p>
                    <h1 id="shop-title">Informatics Merch</h1>
                    <p>Fall 2026 Informatics Merch</p>
                </section>

                <section className="shopPage__collection" aria-labelledby="collection-title">
                    <div className="shopPage__collectionHeader">
                        <div>
                            <p className="shopPage__kicker">The collection</p>
                            <h2 id="collection-title">Coming soon</h2>
                        </div>
                        <p>{products.length} items</p>
                    </div>

                    <div className="shopPage__grid">
                        {products.map((product) => (
                            <article className="shopCard" key={product.sku}>
                                <div className="shopCard__imageWrap">
                                    <img src={product.image} alt={`${product.name} product mockup`} />
                                </div>
                                <div className="shopCard__details">
                                    <div>
                                        <h3>{product.name}</h3>
                                    </div>
                                    <span className="shopCard__status">{shopAvailability}</span>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
}

export default ShopPage;
