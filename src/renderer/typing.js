const field = document.querySelector('input');
let composing = false;
let lastKey = -Infinity;
field.addEventListener('compositionstart', () => { composing = true; });
field.addEventListener('compositionend', event => {
  composing = false;
  Array.from(event.data || '').slice(-6).forEach((char, index) => {
    setTimeout(() => window.maotao.tryKey('', char), index * 75);
  });
});
field.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !composing) { window.close(); return; }
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const now = performance.now();
  if (event.repeat && now - lastKey < 78) return;
  if ((composing || event.isComposing || event.key === 'Process') && !event.code.startsWith('Key')) return;
  lastKey = now;
  window.maotao.tryKey(event.code, event.key);
});
field.addEventListener('input', event => {
  if (!composing && !event.isComposing && event.inputType === 'insertText' &&
      event.data && performance.now() - lastKey > 65) window.maotao.tryKey('', Array.from(event.data).at(-1));
});
