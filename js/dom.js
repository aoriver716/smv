// DOM helpers used by every view.

export function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
            if (v == null || v === false) continue;
            if (k === 'class') node.className = v;
            else if (k === 'html') node.innerHTML = v;
            else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
            else node.setAttribute(k, v);
        }
    }
    for (const c of children.flat()) {
        if (c == null || c === false) continue;
        node.appendChild(typeof c === 'string' || typeof c === 'number'
            ? document.createTextNode(String(c))
            : c);
    }
    return node;
}

export function mount(...nodes) {
    const app = document.getElementById('app');
    app.replaceChildren(...nodes);
    window.scrollTo(0, 0);
}
