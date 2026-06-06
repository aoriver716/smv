// Service worker registration. No-op outside secure contexts and on file://.

export function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    const doRegister = () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.warn('Service worker registration failed:', err);
        });
    };
    if (document.readyState === 'complete') doRegister();
    else window.addEventListener('load', doRegister, { once: true });
}
