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

    <!-- VanJS Embedded -->
    <script>
        {
            let e,t,l,r,o,f=Object,n=f.getPrototypeOf,s=document,a={isConnected:1},i={},d=n(a),u=n(n),_=(e,t,l,r)=>(e??(setTimeout(l,r),new Set)).add(t),h=(e,t,r)=>{let o=l;l=t;try{return e(r)}catch(e){return console.error(e),r}finally{l=o}},c=e=>e.filter(e=>e.t?.isConnected),g=t=>o=_(o,t,()=>{for(let e of o)e.l=c(e.l),e.o=c(e.o);o=e},1e3),w={get val(){return l?.add(this),this.i},get oldVal(){return l?.add(this),this.u},set val(l){let r=this;if(l!==r.i){r.i=l;let o=[...r.o=c(r.o)];for(let t of o)x(t.f,t.s,t.t),t.t=e;r.l.length?t=_(t,r,p):r.u=l}}},v=e=>({__proto__:w,i:e,u:e,l:[],o:[]}),S=e=>n(e??0)===w,y=(e,t)=>{let l=new Set,o={f:e},f=r;r=[];let n=h(e,l,t);n=(n??s).nodeType?n:new Text(n);for(let e of l)g(e),e.l.push(o);for(let e of r)e.t=n;return r=f,o.t=n},x=(e,t=v(),l)=>{let o=new Set,f={f:e,s:t};f.t=l??r?.push(f)??a,t.val=h(e,o);for(let e of o)g(e),e.o.push(f);return t},V=(t,...l)=>{for(let r of l.flat(1/0)){let l=n(r??0),o=l===w?y(()=>r.val):l===u?y(r):r;o!=e&&t.append(o)}return t},b=t=>new Proxy((l,...r)=>{let[o,...a]=n(r[0]??0)===d?r:[{},...r],_=t?s.createElementNS(t,l):s.createElement(l);for(let[t,r]of f.entries(o)){let o=l=>l?f.getOwnPropertyDescriptor(l,t)??o(n(l)):e,s=l+","+t,a=i[s]??(i[s]=o(n(_))?.set??0),d=a?a.bind(_):_.setAttribute.bind(_,t),h=n(r??0);h===w?y(()=>(d(r.val),_)):h!==u||t.startsWith("on")&&!r.h?d(r):y(()=>(d(r()),_))}return V(_,...a)},{get:(t,l)=>t.bind(e,l)}),m=(e,t)=>t?t!==e&&e.replaceWith(t):e.remove(),p=()=>{let l=[...t].filter(e=>e.i!==e.u);t=e;for(let t of new Set(l.flatMap(e=>e.l=c(e.l))))m(t.t,y(t.f,t.t)),t.t=e;for(let e of l)e.u=e.i};
            window.van={add:V,_:e=>(e.h=1,e),tags:b(),tagsNS:b,state:v,val:e=>S(e)?e.val:e,oldVal:e=>S(e)?e.oldVal:e,derive:x,hydrate:(e,t)=>m(e,y(t,e))};
        }
    </script>

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

        const App = () => {
            const container = div("Loading products...");

            fetch('/api/products')
                .then(res => {
                    if (!res.ok) throw new Error("Failed to fetch products");
                    return res.json();
                })
                .then(products => {
                    container.innerHTML = "";
                    van.add(container, products.map(ProductCard));
                })
                .catch(e => {
                    container.innerHTML = "";
                    van.add(container, div({style: "color: red"}, "Error loading products: " + e.message));
                });

            return container;
        };

        // Mount
        const root = document.getElementById("app");
        root.innerHTML = "";
        van.add(root, App());
    </script>
</body>
</html>
  `;
}
