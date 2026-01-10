export function renderHomePage(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>TAP Merchant</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; }
        .product-card { border: 1px solid #ddd; padding: 1rem; margin-bottom: 1rem; border-radius: 8px; }
        .price { font-weight: bold; color: #2ecc71; }
        header { border-bottom: 1px solid #eee; margin-bottom: 2rem; }
    </style>
</head>
<body>
    <header>
        <h1>TAP Merchant Store</h1>
        <p>Verified by Trusted Agent Protocol</p>
    </header>
    <div id="app">Loading...</div>

    <!-- VanJS from CDN -->
    <script type="text/javascript" src="https://cdn.jsdelivr.net/gh/vanjs-org/van/public/van-1.2.6.min.js"></script>

    <script>
        const { div, h2, p, button } = van.tags;

        const ProductCard = (product) => {
            return div({class: "product-card"},
                h2(product.name),
                p(product.description),
                p({class: "price"}, "$" + product.price.toFixed(2)),
                button({onclick: () => alert("Added " + product.name)}, "Add to Cart")
            );
        };

        const App = async () => {
            try {
                const res = await fetch('/api/products');
                if (!res.ok) throw new Error("Failed to fetch products");
                const products = await res.json();

                return div(
                    products.map(ProductCard)
                );
            } catch (e) {
                return div({style: "color: red"}, "Error loading products: " + e.message);
            }
        };

        // Mount
        van.add(document.getElementById("app"), App());
        // Clear loading text
        document.getElementById("app").innerHTML = "";
        van.add(document.getElementById("app"), App());
    </script>
</body>
</html>
  `;
}
