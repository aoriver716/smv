export function wireConfirmButton(btn, {
    onConfirm,
    onArm,
    onDisarm,
    timeoutMs = 2000,
    stopEvents = false,
} = {}) {
    let armed = false;
    let timer = null;
    const disarm = () => {
        if (!armed) return;
        armed = false;
        btn.classList.remove('confirming');
        if (timer) { clearTimeout(timer); timer = null; }
        if (typeof onDisarm === 'function') onDisarm();
    };
    btn.addEventListener('click', e => {
        if (stopEvents) { e.preventDefault(); e.stopPropagation(); }
        if (!armed) {
            armed = true;
            btn.classList.add('confirming');
            if (typeof onArm === 'function') onArm();
            timer = setTimeout(disarm, timeoutMs);
            return;
        }
        disarm();
        if (typeof onConfirm === 'function') onConfirm();
    });
    return { disarm };
}
