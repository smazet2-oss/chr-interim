'use strict';
// Bouton « Imprimer » des badges et cartes d'accès du job dating.
document.addEventListener('click', e => { if (e.target.closest('[data-imprimer]')) window.print(); });
