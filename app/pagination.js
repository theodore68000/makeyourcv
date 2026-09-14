/* ============================================================
   Pagination : répartit le CV rendu (voir render.js) sur autant de
   pages A4 que nécessaire, sans jamais couper une unité de contenu
   (une entrée, un bloc compétences...) entre deux pages.

   Principe : on mesure le rendu réel dans une page invisible (mêmes
   classes CSS que la vraie, donc même police, même largeur, mêmes
   puces) plutôt que de calculer des tailles à la main, pour rester
   fidèle à ce que produirait vraiment le CSS des templates.
   ============================================================ */

// Construit une page cachée avec `innerHTML`, où le header (s'il est
// présent) et les blocs sont de simples enfants directs du conteneur mesuré
// — sans aucune div englobante — pour que les règles CSS qui dépendent de la
// position dans la fratrie (ex. « .s-entry:last-child { margin-bottom: 0 } »)
// se comportent exactement comme dans le rendu final. On retrouve ensuite la
// position basse de chaque bloc en comptant ses enfants directs : un bloc
// commence par « <h2> » quand il regroupe un titre de section avec sa
// première carte (2 éléments racine), sinon c'est une carte seule (1 élément
// racine) — voir `decouperEnUnites` dans render.js.
function mesurerPage(classes, innerHTML, header, blocks, selecteurConteneur = null) {
  const page = document.createElement("div");
  page.className = classes;
  Object.assign(page.style, { position: "absolute", visibility: "hidden", left: "-99999px", top: "0" });
  document.body.appendChild(page);
  page.innerHTML = innerHTML;

  const conteneur = selecteurConteneur ? page.querySelector(selecteurConteneur) : page;
  const rect = conteneur.getBoundingClientRect();
  const style = getComputedStyle(conteneur);
  const dispo = rect.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const hautInterieur = rect.top + parseFloat(style.paddingTop);

  const enfants = [...conteneur.children];
  let idx = header ? 1 : 0; // le header (s'il y en a un) est un unique élément racine
  const bas = blocks.map(bloc => {
    const nbElements = bloc.startsWith("<h2>") ? 2 : 1;
    const dernier = enfants[idx + nbElements - 1];
    idx += nbElements;
    return dernier.getBoundingClientRect().bottom - hautInterieur;
  });

  page.remove();
  return { bas, dispo };
}

// Répartition gloutonne : avance tant que l'unité suivante tient sur la page
// courante, sinon ouvre une nouvelle page. Une unité qui ne tiendrait sur
// aucune page (plus haute qu'une page entière) est tout de même placée seule
// sur sa page (au pire elle débordera légèrement, cas limite).
function repartirEnGroupes(bas, dispo) {
  const groupes = [];
  let groupe = [];
  let debut = 0;
  for (let i = 0; i < bas.length; i++) {
    if (bas[i] - debut > dispo && groupe.length) {
      groupes.push(groupe);
      debut = bas[groupe[groupe.length - 1]];
      groupe = [];
    }
    groupe.push(i);
  }
  if (groupe.length) groupes.push(groupe);
  return groupes;
}

// Template sobre : une seule largeur du début à la fin, donc une seule passe
// de mesure suffit.
export function paginerSobre(header, blocks, compact) {
  const classes = "page sobre" + (compact ? " compact" : "");
  if (!blocks.length) return [`<div class="${classes}">${header}</div>`];

  const { bas, dispo } = mesurerPage(classes, header + blocks.join(""), header, blocks);
  const groupes = repartirEnGroupes(bas, dispo);
  return groupes.map((g, n) =>
    `<div class="${classes}">${n === 0 ? header : ""}${g.map(i => blocks[i]).join("")}</div>`
  );
}

// Template visuel : le bandeau latéral n'apparaît que sur la première page,
// dont la colonne principale est donc plus étroite (à côté du bandeau) ; les
// pages suivantes n'ont pas de bandeau et la colonne principale y occupe
// toute la largeur (classe "suite") — d'où les deux passes de mesure.
export function paginerVisuel(aside, header, blocks, compact) {
  const classes = "page visuel" + (compact ? " compact" : "");
  if (!blocks.length) {
    return [`<div class="${classes}">${aside}<main class="v-main">${header}</main></div>`];
  }

  const passe1 = mesurerPage(
    classes,
    `${aside}<main class="v-main">${header}${blocks.join("")}</main>`,
    header, blocks, ".v-main"
  );
  const premierGroupe = repartirEnGroupes(passe1.bas, passe1.dispo)[0];
  const page1 = `<div class="${classes}">${aside}<main class="v-main">${header}${premierGroupe.map(i => blocks[i]).join("")}</main></div>`;

  const restants = blocks.slice(premierGroupe.length);
  if (!restants.length) return [page1];

  const classesSuite = classes + " suite";
  const passe2 = mesurerPage(classesSuite, `<main class="v-main">${restants.join("")}</main>`, "", restants, ".v-main");
  const pagesSuite = repartirEnGroupes(passe2.bas, passe2.dispo).map(g =>
    `<div class="${classesSuite}"><main class="v-main">${g.map(i => restants[i]).join("")}</main></div>`
  );
  return [page1, ...pagesSuite];
}
