import { el } from '../dom.js';
import { openModal } from '../ui/modal.js';

export const PRESENT_TUTORIAL_KEY = 'smv.presentTutorialDismissed';

export function showPresentTutorial(onClose) {
    const dontShow = el('input', { type: 'checkbox', id: 'dont-show-tutorial' });
    const okBtn = el('button', { type: 'button' }, 'Got it');
    const body = [
        el('h2', null, 'Presentation mode'),
        el('p', null, 'The stanza fills the screen for projection.'),
        el('p', null,
            'Keyboard: ',
            el('kbd', null, '\u2190'), ' and ', el('kbd', null, '\u2192'),
            ' move between stanzas, ',
            el('kbd', null, 'Esc'), ' exits.'),
        el('p', null,
            'Touch: tap the left or right side of the screen to move between stanzas. ',
            'Tap the top edge to slide the font-size slider into view; it slides back out after a moment. ',
            'Use your device\u2019s usual gesture to exit fullscreen when you\u2019re done.'),
        el('div', { class: 'modal-controls' },
            el('label', { for: 'dont-show-tutorial' }, dontShow, ' Don\u2019t show this again'),
            okBtn,
        ),
    ];
    const handle = openModal({
        body,
        initialFocus: okBtn,
        onClose: () => {
            if (dontShow.checked) localStorage.setItem(PRESENT_TUTORIAL_KEY, '1');
            if (typeof onClose === 'function') onClose();
        },
    });
    okBtn.addEventListener('click', () => handle.close());
}
