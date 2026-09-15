/* ============================================================
   Rendu des deux templates du CV, à partir de l'annuaire (CV)
   et de la sélection (S). Logique reprise à l'identique du
   prototype (prototype/cv-templates.html), juste paramétrée
   au lieu de dépendre de variables globales.
   ============================================================ */

export const LABELS = {
  formation:   { fr: "Formation", en: "Education" },
  experiences: { fr: "Expériences", en: "Experience" },
  projets:     { fr: "Projets", en: "Projects" },
  competences: { fr: "Compétences", en: "Skills" },
  langues:     { fr: "Langues", en: "Languages" },
  interets:    { fr: "Centres d’intérêt", en: "Interests" },
  contact:     { fr: "Contact", en: "Contact" }
}; 

const ICON = {
  phone: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-9 5.7a2 2 0 0 1-2 0L2 7"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>',
  car: '<svg viewBox="0 0 24 24"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>'
};

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Un texte est soit une chaîne (identique dans les deux langues), soit { fr, en }.
export const texteLangue = (v, langue) => v == null ? "" : typeof v === "string" ? v : (v[langue] ?? v.fr ?? "");

// Fabrique les fonctions utilitaires liées à un CV et une sélection donnés.
function creerOutils(CV, S) {
  const t = v => texteLangue(v, S.langue);
  const tx = v => esc(t(v));
  const colon = () => S.langue === "fr" ? " :" : ":";
  const pick = (list, ids) => { const m = new Map(list.map(x => [x.id, x])); return (ids || []).map(id => m.get(id)).filter(Boolean); };
  // Titre affiché : le titre libre s'il est rempli, sinon la variante choisie, sinon rien
  const titreAffiche = () => (S.titreLibre && S.titreLibre.trim()) ? S.titreLibre.trim() : pick(CV.titres, [S.titre])[0];
  // « Photographie » devient « photographie » après une virgule (mais « DIY » reste « DIY »)
  const enLigne = (s, n) => n > 0 && /^\p{Lu}\p{Ll}/u.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
  const pucesDe = item => S.puces && S.puces[item.id] ? pick(item.puces || [], S.puces[item.id]) : (item.puces || []);

  function contacts() {
    const I = CV.identite;
    const all = {
      ville:     { icon: "pin", text: t(I.ville) },
      telephone: { icon: "phone", text: I.telephone, href: "tel:" + I.telephone.replace(/\s/g, "") },
      email:     { icon: "mail", text: I.email, href: "mailto:" + I.email },
      linkedin:  { icon: "linkedin", text: I.linkedin, href: I.linkedinUrl },
      permis:    { icon: "car", text: t(I.permis) }
    };
    for (const c of I.coordonneesPersonnalisees || []) {
      all[c.id] = { icon: c.icone, text: c.texte, href: c.lien || undefined };
    }
    // Une coordonnée fixe reste dans S.contact même une fois son champ vidé
    // (seul le panneau la masque de la liste à cocher) : on ne l'affiche donc
    // que si elle a un texte, pour ne jamais laisser un « | » orphelin.
    return S.contact.map(k => all[k]).filter(c => c && c.text);
  }
  const lien = c => c.href ? `<a href="${esc(c.href)}">${esc(c.text)}</a>` : esc(c.text);

  return { t, tx, colon, pick, titreAffiche, enLigne, pucesDe, contacts, lien };
}

// Découpe une section en « unités » atomiques pour la pagination (voir
// pagination.js) : la première unité regroupe le titre de la section avec
// sa première carte, pour ne jamais laisser un titre seul en bas de page ;
// les cartes suivantes sont des unités indépendantes qui peuvent partir sur
// la page suivante (une carte elle-même n'est, elle, jamais coupée en deux).
function decouperEnUnites(titre, cartes) {
  return cartes.length ? [titre + cartes[0], ...cartes.slice(1)] : [];
}

/* ---------- Template sobre ---------- */
// Renvoie { header, blocks } : `header` (nom/titre/coordonnées) reste fixe
// en haut de la première page ; `blocks` est la liste ordonnée des unités
// insécables à répartir sur une ou plusieurs pages A4 (voir pagination.js).
export function renderSobre(CV, S) {
  const { tx, colon, pick, titreAffiche, enLigne, pucesDe, contacts, lien } = creerOutils(CV, S);
  const I = CV.identite, titre = titreAffiche();

  function sEntry(titre, lieu, sous, dates, desc, puces, descClasse = "") {
    return `<div class="s-entry">
    <div class="s-row"><b>${tx(titre)}</b><span>${tx(lieu)}</span></div>
    ${sous || dates ? `<div class="s-row"><i>${tx(sous)}</i><i>${tx(dates)}</i></div>` : ""}
    ${desc ? `<p${descClasse ? ` class="${descClasse}"` : ""}>${tx(desc)}</p>` : ""}
    ${puces.length ? `<ul>${puces.map(p => `<li>${tx(p)}</li>`).join("")}</ul>` : ""}
  </div>`;
  }

  // Chaque projet devient une « carte » comme une formation : titre du projet
  // en gras seul sur sa ligne, puis sa description (à écrire comme une phrase
  // sur les compétences développées) en dessous.
  function projets() {
    const items = pick(CV.projets, S.projets);
    if (!items.length) return [];
    const cartes = items.map(p => sEntry(p.titre, "", null, null, p.description, pucesDe(p), "s-projet-desc"));
    return decouperEnUnites(`<h2>${tx(LABELS.projets)}</h2>`, cartes);
  }

  // Compétences et langues restent regroupées dans une seule section, comme
  // dans le prototype d'origine (les centres d'intérêt et les projets n'y
  // sont plus, voir plus bas / ci-dessus).
  function competences() {
    const comp = pick(CV.competences, S.competences);
    const lang = pick(CV.langues, S.langues);
    const lignes = comp.map(c => `<p><b>${tx(c.categorie)}${colon()}</b> ${tx(c.valeur)}</p>`);
    if (lang.length) lignes.push(`<p><b>${tx(LABELS.langues)}${colon()}</b> ${lang.map(l => `${tx(l)} (${tx(l.niveau)})`).join(", ")}</p>`);
    if (!lignes.length) return [];
    return decouperEnUnites(`<h2>${tx(LABELS.competences)}</h2>`, [`<div class="s-lignes">${lignes.join("")}</div>`]);
  }

  const SOBRE = {
    formation() {
      const items = pick(CV.formations, S.formation);
      if (!items.length) return [];
      const cartes = items.map(f => sEntry(f.ecole, f.lieu, f.diplome, f.dates, null, pucesDe(f)));
      return decouperEnUnites(`<h2>${tx(LABELS.formation)}</h2>`, cartes);
    },
    experiences() {
      const items = pick(CV.experiences, S.experiences);
      if (!items.length) return [];
      const cartes = items.map(e => sEntry(e.organisation, e.lieu, e.poste, e.dates, e.description, pucesDe(e)));
      return decouperEnUnites(`<h2>${tx(LABELS.experiences)}</h2>`, cartes);
    },
    projets,
    competences,
    // Deux affichages possibles (S.interetsAffichage) : « phrase » (liste
    // simple, en une phrase) ou « liste » (une ligne par centre, titre en
    // gras, détail après « : » s'il est rempli).
    interets() {
      const inte = pick(CV.interets, S.interets);
      if (!inte.length) return [];
      const contenu = S.interetsAffichage === "liste"
        ? `<div class="s-lignes">${inte.map(i => `<p><b>${tx(i)}</b>${i.detail ? `${colon()} ${tx(i.detail)}` : ""}</p>`).join("")}</div>`
        : `<div class="s-lignes"><p>${inte.map((i, n) => enLigne(tx(i), n)).join(", ")}</p></div>`;
      return decouperEnUnites(`<h2>${tx(LABELS.interets)}</h2>`, [contenu]);
    }
  };
  // Sections personnalisées : même format « carte » que les projets.
  for (const section of CV.sectionsPersonnalisees || []) {
    SOBRE[section.id] = () => {
      const items = pick(section.items, S[section.id]);
      if (!items.length) return [];
      const cartes = items.map(it => sEntry(it.titre, "", null, null, it.description, pucesDe(it)));
      return decouperEnUnites(`<h2>${tx(section.titre)}</h2>`, cartes);
    };
  }

  const header = `<header>
      <h1>${esc(I.prenom)} ${esc(I.nom.toUpperCase())}</h1>
      ${titre ? `<p class="s-titre">${tx(titre)}</p>` : ""}
      <p class="s-contact">${contacts().map(lien).join(" | ")}</p>
    </header>`;
  const blocks = S.sections.flatMap(s => SOBRE[s] ? SOBRE[s]() : []);
  return { header, blocks };
}

/* ---------- Template visuel ---------- */
// Renvoie { aside, header, blocks } : `aside` (bandeau latéral photo/
// compétences/langues/intérêts) n'apparaît que sur la première page ;
// `header` (nom/titre/coordonnées) reste fixe en haut de la première page ;
// `blocks` est la liste ordonnée des unités insécables de la colonne
// principale, à répartir sur une ou plusieurs pages (voir pagination.js).
export function renderVisuel(CV, S) {
  const { tx, colon, pick, titreAffiche, enLigne, pucesDe, contacts, lien } = creerOutils(CV, S);
  const I = CV.identite, titre = titreAffiche();

  function vEntry(dates, lieu, titre, sous, desc, puces) {
    return `<div class="v-entry">
    <div><div class="v-dates">${tx(dates)}</div>${lieu ? `<div class="v-lieu">${tx(lieu)}</div>` : ""}</div>
    <div>
      <div class="v-org">${tx(titre)}</div>
      ${sous ? `<div class="v-sub">${tx(sous)}</div>` : ""}
      ${desc ? `<p class="v-desc">${tx(desc)}</p>` : ""}
      ${puces.length ? `<ul class="v-puces">${puces.map(p => `<li>${tx(p)}</li>`).join("")}</ul>` : ""}
    </div>
  </div>`;
  }

  const VISUEL = {
    formation() {
      const items = pick(CV.formations, S.formation);
      if (!items.length) return [];
      const cartes = items.map(f => vEntry(f.dates, f.lieu, f.ecole, f.diplome, null, pucesDe(f)));
      return decouperEnUnites(`<h2>${tx(LABELS.formation)}</h2>`, cartes);
    },
    experiences() {
      const items = pick(CV.experiences, S.experiences);
      if (!items.length) return [];
      const cartes = items.map(e => vEntry(e.dates, e.lieu, e.organisation, e.poste, e.description, pucesDe(e)));
      return decouperEnUnites(`<h2>${tx(LABELS.experiences)}</h2>`, cartes);
    },
    // La grille de projets (deux colonnes) forme une seule unité insécable :
    // on ne peut pas répartir des cartes individuelles entre deux pages sans
    // casser la grille visuellement.
    projets() {
      const items = pick(CV.projets, S.projets);
      if (!items.length) return [];
      const cartesHtml = items.map(p => {
        const puces = pucesDe(p);
        return `<div class="v-projet"><div class="v-projet-titre">${tx(p.titre)}</div>` +
          `${p.description ? `<p class="v-projet-desc">${tx(p.description)}</p>` : ""}` +
          `${puces.length ? `<ul class="v-puces">${puces.map(pc => `<li>${tx(pc)}</li>`).join("")}</ul>` : ""}</div>`;
      });
      return decouperEnUnites(`<h2>${tx(LABELS.projets)}</h2>`, [`<div class="v-projets">${cartesHtml.join("")}</div>`]);
    }
    /* compétences, langues et centres d’intérêt vont dans la colonne latérale */
  };
  // Sections personnalisées : même format « carte » que les projets (même
  // remarque sur la grille à deux colonnes, insécable).
  for (const section of CV.sectionsPersonnalisees || []) {
    VISUEL[section.id] = () => {
      const items = pick(section.items, S[section.id]);
      if (!items.length) return [];
      const cartesHtml = items.map(it => {
        const puces = pucesDe(it);
        return `<div class="v-projet"><div class="v-projet-titre">${tx(it.titre)}</div>` +
          `${it.description ? `<p>${tx(it.description)}</p>` : ""}` +
          `${puces.length ? `<ul class="v-puces">${puces.map(pc => `<li>${tx(pc)}</li>`).join("")}</ul>` : ""}</div>`;
      });
      return decouperEnUnites(`<h2>${tx(section.titre)}</h2>`, [`<div class="v-projets">${cartesHtml.join("")}</div>`]);
    };
  }

  const comp = pick(CV.competences, S.competences);
  const lang = pick(CV.langues, S.langues);
  const inte = pick(CV.interets, S.interets);
  const aside = `<aside class="v-side">
      ${I.photo ? `<img class="v-photo" src="${I.photo}" alt="">` : ""}
      ${comp.length ? `<section><h3>${tx(LABELS.competences)}</h3>${comp.map(c =>
        `<div class="v-skill"><div class="v-skill-cat">${tx(c.categorie)}</div><div>${tx(c.valeur)}</div></div>`).join("")}</section>` : ""}
      ${lang.length ? `<section><h3>${tx(LABELS.langues)}</h3><ul class="v-langues">${lang.map(l =>
        `<li><span>${tx(l)}</span><span class="v-niv">${tx(l.niveau)}</span></li>`).join("")}</ul></section>` : ""}
      ${inte.length ? `<section><h3>${tx(LABELS.interets)}</h3>${
        S.interetsAffichage === "liste"
          ? `<ul class="v-interets">${inte.map(i => `<li><b>${tx(i)}</b>${i.detail ? `${colon()} ${tx(i.detail)}` : ""}</li>`).join("")}</ul>`
          : `<p>${inte.map((i, n) => enLigne(tx(i), n)).join(", ")}</p>`
      }</section>` : ""}
    </aside>`;
  const header = `<header><h1>${esc(I.prenom)} ${esc(I.nom.toUpperCase())}</h1>
      ${titre ? `<p class="v-titre">${tx(titre)}</p>` : ""}
      <ul class="v-contact">${contacts().map(c => `<li>${ICON[c.icon]}<span>${lien(c)}</span></li>`).join("")}</ul>
      </header>`;
  const blocks = S.sections.flatMap(s => VISUEL[s] ? VISUEL[s]() : []);
  return { aside, header, blocks };
}
