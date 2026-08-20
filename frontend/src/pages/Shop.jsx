import { shopProducts } from "../assets/data/ShopData";

function ShopPage({ products = shopProducts }) {
    return (
        <div className="baseContainer">
            <main className="shopPage">
                <section className="shopPage__hero" aria-labelledby="shop-title">
                    <p className="shopPage__kicker">IUGA collection</p>
                    <h1 id="shop-title">Wear your Info pride.</h1>
                    <p>
                        A first look at IUGA gear made for the people, projects, and late nights that make up the
                        Information School community.
                    </p>
                </section>

                <section className="shopPage__collection" aria-labelledby="collection-title">
                    <div className="shopPage__collectionHeader">
                        <div>
                            <p className="shopPage__kicker">The collection</p>
                            <h2 id="collection-title">Coming soon</h2>
                        </div>
                        <p>{products.length} pieces</p>
                    </div>

                    <div className="shopPage__grid">
                        {products.map((product) => (
                            <article className="shopCard" key={product.title}>
                                <div className="shopCard__imageWrap">
                                    <img src={product.image} alt={`${product.title} product mockup`} />
                                </div>
                                <div className="shopCard__details">
                                    <div>
                                        <h3>{product.title}</h3>
                                        <p>{product.description}</p>
                                    </div>
                                    <span className="shopCard__status">Coming soon</span>
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
