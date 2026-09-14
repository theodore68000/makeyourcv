/* ============================================================
   Panneau de réglages (colonne de gauche) : construit les
   contrôles à partir de l'annuaire (CV) et modifie la sélection
   (S) en place. Après chaque changement, appelle onChange()
   (fourni par app.js) pour rafraîchir l'aperçu.
   Libellés de l'interface toujours en français, quelle que soit
   la langue choisie pour l'export (S.langue).
   Réordonnancement par glisser-déposer : SortableJS (chargé en
   CDN dans index.html, disponible ici via window.Sortable).
   ============================================================ */
import { LABELS, texteLangue } from "./render.js";
import { api, fichierEnBase64 } from "./api.js";

const T = v => texteLangue(v, "fr");

// Place les éléments sélectionnés en tête (dans l'ordre de la sélection),
// puis les éléments non sélectionnés à la suite (dans l'ordre de l'annuaire).
function ordonnerSelonSelection(items, idsSelectionnes) {
  const parId = new Map(items.map(it => [it.id, it]));
  const selectionnes = (idsSelectionnes || []).map(id => parId.get(id)).filter(Boolean);
  const idsSel = new Set(selectionnes.map(it => it.id));
  const reste = items.filter(it => !idsSel.has(it.id));
  return [...selectionnes, ...reste];
}

function creerLibelleGroupe(texte) {
  const span = document.createElement("span");
  span.className = "libelle-groupe";
  span.textContent = texte;
  return span;
}

// Boutons segmentés (ex. Sobre/Visuel). `valeurCourante()` lit la valeur
// actuelle, `definir(valeur)` l'écrit dans S.
function creerBoutonsSegment(options, valeurCourante, definir, onChange) {
  const seg = document.createElement("div");
  seg.className = "seg";
  const boutons = options.map(({ value, label }) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(valeurCourante() === value));
    b.onclick = () => {
      definir(value);
      boutons.forEach((x, i) => x.setAttribute("aria-pressed", String(options[i].value === valeurCourante())));
      onChange();
    };
    seg.appendChild(b);
    return b;
  });
  return seg;
}

function creerSection(titre, contenu, ouvert = true) {
  const details = document.createElement("details");
  details.className = "panneau-section";
  details.open = ouvert;
  const summary = document.createElement("summary");
  summary.textContent = titre;
  details.appendChild(summary);
  details.appendChild(contenu);
  return details;
}

// Construit une <ul> de cases à cocher réordonnables.
// `items` = [{ id, texte, ...}]. `estCoche(id)` donne l'état initial.
// `surChangement(idsCoches)` est rappelé (case cochée/décochée ou glisser-
// déposer) avec la liste des id cochés, dans l'ordre affiché.
// `creerExtra(item)` peut renvoyer un nœud supplémentaire ajouté sous la ligne
// (utilisé pour les puces dépliables).
function creerListeCoches(items, estCoche, surChangement, creerExtra) {
  const ul = document.createElement("ul");
  ul.className = "liste-reordonnable";

  const recalculer = () => {
    const ids = [...ul.children].filter(li => li.querySelector(":scope > .ligne-item input").checked).map(li => li.dataset.id);
    surChangement(ids);
  };

  for (const item of items) {
    const li = document.createElement("li");
    li.dataset.id = item.id;

    const ligne = document.createElement("div");
    ligne.className = "ligne-item";

    const poignee = document.createElement("span");
    poignee.className = "poignee";
    poignee.textContent = "⠿";
    poignee.setAttribute("aria-hidden", "true");
    ligne.appendChild(poignee);

    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = estCoche(item.id);
    input.onchange = recalculer;
    label.appendChild(input);
    label.append(" " + item.texte);
    ligne.appendChild(label);

    li.appendChild(ligne);
    if (creerExtra) {
      const extra = creerExtra(item);
      if (extra) li.appendChild(extra);
    }
    ul.appendChild(li);
  }

  Sortable.create(ul, { handle: ".poignee", animation: 150, onEnd: recalculer });

  return ul;
}

function retirerDeTableau(tableau, id) {
  const index = tableau.findIndex(x => x.id === id);
  if (index !== -1) tableau.splice(index, 1);
}

// Génère un id unique (absent de `liste`) à partir d'un texte.
function genererId(liste, texte, repli = "element") {
  const base = texte
    .normalize("NFKD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 40) || repli;
  let id = base, n = 2;
  while (liste.some(x => x.id === id)) { id = `${base}-${n}`; n++; }
  return id;
}

// Combine deux champs fr/en saisis : chaîne simple si identiques ou EN vide,
// objet { fr, en } sinon (cf. la règle de l'annuaire : « un texte est soit une
// chaîne, identique dans les deux langues, soit un objet »).
function valeurTexteBilingue(fr, en) {
  fr = (fr || "").trim();
  en = (en || "").trim();
  if (!fr) return "";
  return (en && en !== fr) ? { fr, en } : fr;
}

// « Modifier » (édition inline fr/en) et « Supprimer » pour une puce donnée.
function creerActionsPuce(S, item, puceId, onChange, onAnnuaireModifie, rafraichir) {
  const puce = item.puces.find(p => p.id === puceId);
  if (!puce) return null;

  const conteneur = document.createElement("div");
  conteneur.className = "actions-puce";

  const boutonModifier = document.createElement("button");
  boutonModifier.type = "button";
  boutonModifier.className = "discret";
  boutonModifier.textContent = "Modifier";
  boutonModifier.onclick = () => {
    conteneur.innerHTML = "";
    conteneur.appendChild(creerFormulaireEditionPuce(puce, {
      onValider: (fr, en) => {
        puce.fr = fr;
        if (en) puce.en = en; else delete puce.en;
        onAnnuaireModifie();
        onChange();
        rafraichir();
      },
      onAnnuler: rafraichir
    }));
  };

  const boutonSupprimer = document.createElement("button");
  boutonSupprimer.type = "button";
  boutonSupprimer.className = "discret danger";
  boutonSupprimer.textContent = "Supprimer";
  boutonSupprimer.onclick = () => {
    if (!confirm("Supprimer cette puce de l’annuaire ? Cette action est irréversible.")) return;
    retirerDeTableau(item.puces, puceId);
    if (S.puces[item.id]) S.puces[item.id] = S.puces[item.id].filter(id => id !== puceId);
    onAnnuaireModifie();
    onChange();
    rafraichir();
  };

  conteneur.append(boutonModifier, boutonSupprimer);
  return conteneur;
}

function creerFormulaireEditionPuce(puce, { onValider, onAnnuler }) {
  const form = document.createElement("form");
  form.className = "formulaire-puce";
  const champFr = document.createElement("input");
  champFr.type = "text"; champFr.placeholder = "Texte (français)"; champFr.required = true;
  champFr.value = puce.fr || "";
  const champEn = document.createElement("input");
  champEn.type = "text"; champEn.placeholder = "Texte (anglais, optionnel)";
  champEn.value = puce.en || "";
  const boutonValider = document.createElement("button");
  boutonValider.type = "submit"; boutonValider.textContent = "Valider";
  const boutonAnnuler = document.createElement("button");
  boutonAnnuler.type = "button"; boutonAnnuler.className = "discret"; boutonAnnuler.textContent = "Annuler";
  boutonAnnuler.onclick = onAnnuler;
  form.append(champFr, champEn, boutonValider, boutonAnnuler);
  form.onsubmit = evt => {
    evt.preventDefault();
    const fr = champFr.value.trim();
    if (!fr) return;
    onValider(fr, champEn.value.trim());
  };
  return form;
}

function creerFormulaireAjoutPuce(S, item, onChange, onAnnuaireModifie, rafraichir) {
  const form = document.createElement("form");
  form.className = "formulaire-puce";
  const champFr = document.createElement("input");
  champFr.type = "text"; champFr.placeholder = "Nouvelle puce (français)"; champFr.required = true;
  const champEn = document.createElement("input");
  champEn.type = "text"; champEn.placeholder = "Anglais (optionnel)";
  const boutonAjouter = document.createElement("button");
  boutonAjouter.type = "submit"; boutonAjouter.textContent = "+ Ajouter";
  form.append(champFr, champEn, boutonAjouter);
  form.onsubmit = evt => {
    evt.preventDefault();
    const fr = champFr.value.trim();
    if (!fr) return;
    const en = champEn.value.trim();
    const id = genererId(item.puces, fr, "puce");
    const nouvellePuce = en ? { id, fr, en } : { id, fr };
    item.puces.push(nouvellePuce);
    if (S.puces[item.id]) S.puces[item.id].push(nouvellePuce.id);
    onAnnuaireModifie();
    onChange();
    rafraichir();
  };
  return form;
}

// Bouton « Puces ▾ » dépliant la liste des puces de l'élément : cases à
// cocher + glisser-déposer pour la sélection, et modification/suppression/
// ajout du texte (écrit dans l'annuaire, via onAnnuaireModifie).
// `item` est l'entrée brute de l'annuaire (formation ou expérience) : ses
// puces sont mutées en place pour que les changements portent sur le CV.
function creerExtraPuces(S, item, onChange, onAnnuaireModifie) {
  item.puces = item.puces || [];

  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "bouton-puces";
  bouton.setAttribute("aria-expanded", "false");

  const conteneur = document.createElement("div");
  conteneur.className = "conteneur-puces";
  conteneur.hidden = true;

  function rafraichir() {
    bouton.textContent = `Puces ▾ (${item.puces.length})`;
    conteneur.innerHTML = "";
    const puces = ordonnerSelonSelection(
      item.puces.map(p => ({ id: p.id, texte: T(p) })),
      S.puces[item.id]
    );
    const sousUl = creerListeCoches(
      puces,
      id => !S.puces[item.id] || S.puces[item.id].includes(id),
      ids => { S.puces[item.id] = ids; onChange(); },
      puceItem => creerActionsPuce(S, item, puceItem.id, onChange, onAnnuaireModifie, rafraichir)
    );
    sousUl.classList.add("liste-puces");
    conteneur.appendChild(sousUl);
    conteneur.appendChild(creerFormulaireAjoutPuce(S, item, onChange, onAnnuaireModifie, rafraichir));
  }
  rafraichir();

  bouton.onclick = () => {
    conteneur.hidden = !conteneur.hidden;
    bouton.setAttribute("aria-expanded", String(!conteneur.hidden));
  };

  const fragment = document.createDocumentFragment();
  fragment.append(bouton, conteneur);
  return fragment;
}

// Lit, pour un champ de schéma donné, la valeur actuelle d'une entrée de
// l'annuaire (chaîne pour un champ bilingue non encore traduit, objet
// { fr, en } sinon) — utilisé pour préremplir le formulaire de modification.
function valeurDepuisEntree(entree, champ) {
  const brut = entree[champ.cle];
  if (champ.bilingue) {
    if (brut && typeof brut === "object") return { fr: brut.fr || "", en: brut.en || "" };
    return { fr: brut || "", en: "" };
  }
  return brut || "";
}

// Construit les champs de saisie d'un formulaire d'entrée (ajout ou
// modification) à partir de `schema.champs`, préremplis selon
// `valeurInitiale(champ)` si fourni (sinon vides). Renvoie les « lecteurs »
// permettant de relire les valeurs saisies à la validation.
function construireChampsEntree(schema, form, valeurInitiale) {
  return schema.champs.map(champ => {
    if (champ.bilingue) {
      const init = valeurInitiale ? valeurInitiale(champ) : { fr: "", en: "" };
      const groupe = document.createElement("div");
      groupe.className = "champ-bilingue";
      const inputFr = document.createElement("input");
      inputFr.type = "text"; inputFr.placeholder = `${champ.label} (français)`; inputFr.required = !!champ.requis;
      inputFr.value = init.fr;
      const inputEn = document.createElement("input");
      inputEn.type = "text"; inputEn.placeholder = `${champ.label} (anglais, optionnel)`;
      inputEn.value = init.en;
      groupe.append(inputFr, inputEn);
      form.appendChild(groupe);
      return { cle: champ.cle, lire: () => ({ fr: inputFr.value.trim(), en: inputEn.value.trim() }) };
    }
    const init = valeurInitiale ? valeurInitiale(champ) : "";
    const input = document.createElement("input");
    input.type = "text"; input.placeholder = champ.label + (champ.requis ? "" : " (optionnel)"); input.required = !!champ.requis;
    input.value = init;
    form.appendChild(input);
    return { cle: champ.cle, lire: () => input.value.trim() };
  });
}

// Formulaire d'ajout d'une nouvelle entrée dans une liste de l'annuaire
// (formation, expérience, projet, compétence, langue ou centre d'intérêt).
// `schema.champs` décrit les champs à saisir, `schema.construire` fabrique
// l'entrée finale à partir des valeurs saisies et d'un id généré.
function creerFormulaireAjoutEntree(schema, cvListe, onCreer) {
  const form = document.createElement("form");
  form.className = "formulaire-entree";

  const lecteurs = construireChampsEntree(schema, form, null);

  const bouton = document.createElement("button");
  bouton.type = "submit";
  bouton.textContent = "+ Ajouter " + schema.titre;
  form.appendChild(bouton);

  form.onsubmit = evt => {
    evt.preventDefault();
    const valeurs = {};
    for (const l of lecteurs) valeurs[l.cle] = l.lire();
    const texteId = schema.texteId(valeurs);
    if (!texteId) return;
    const entree = schema.construire(valeurs, genererId(cvListe, texteId, "element"));
    onCreer(entree);
    form.reset();
  };

  return form;
}

// Formulaire de modification d'une entrée existante : mêmes champs que
// l'ajout, préremplis avec les valeurs actuelles de `entree`.
function creerFormulaireModificationEntree(schema, entree, { onValider, onAnnuler }) {
  const form = document.createElement("form");
  form.className = "formulaire-entree";

  const lecteurs = construireChampsEntree(schema, form, champ => valeurDepuisEntree(entree, champ));

  const boutonValider = document.createElement("button");
  boutonValider.type = "submit"; boutonValider.textContent = "Valider";
  const boutonAnnuler = document.createElement("button");
  boutonAnnuler.type = "button"; boutonAnnuler.className = "discret"; boutonAnnuler.textContent = "Annuler";
  boutonAnnuler.onclick = onAnnuler;
  form.append(boutonValider, boutonAnnuler);

  form.onsubmit = evt => {
    evt.preventDefault();
    const valeurs = {};
    for (const l of lecteurs) valeurs[l.cle] = l.lire();
    onValider(valeurs);
  };

  return form;
}

// Réécrit `entree` en place à partir des valeurs saisies (id et puces
// conservés) : delete + reconstruction, pour repartir d'un état propre même
// si un champ optionnel a été vidé lors de la modification.
function appliquerModificationEntree(entree, valeurs, schema) {
  const puces = entree.puces;
  const nouvelle = schema.construire(valeurs, entree.id);
  for (const cle of Object.keys(entree)) delete entree[cle];
  Object.assign(entree, nouvelle);
  if (puces !== undefined) entree.puces = puces;
}

// « Modifier » une entrée entière (pas seulement ses puces) : bouton qui
// déplie un formulaire de modification préremplis à la place du bouton.
function creerActionsEntree(schema, entree, onChange, onAnnuaireModifie, rafraichir) {
  const conteneur = document.createElement("div");
  conteneur.className = "actions-entree";

  const boutonModifier = document.createElement("button");
  boutonModifier.type = "button";
  boutonModifier.className = "discret";
  boutonModifier.textContent = "Modifier";
  boutonModifier.onclick = () => {
    conteneur.innerHTML = "";
    conteneur.appendChild(creerFormulaireModificationEntree(schema, entree, {
      onValider: valeurs => {
        appliquerModificationEntree(entree, valeurs, schema);
        onAnnuaireModifie();
        onChange();
        rafraichir();
      },
      onAnnuler: rafraichir
    }));
  };

  conteneur.appendChild(boutonModifier);
  return conteneur;
}

// Section complète d'une liste de contenu de l'annuaire : cases à cocher +
// glisser-déposer pour la sélection, plus un bouton « Supprimer de
// l'annuaire » par ligne et un formulaire d'ajout en bas.
// `creerExtraLigne(itemBrut)` ajoute un contenu par ligne en plus (les puces,
// pour Formation/Expériences). `apresModificationListe`, s'il est fourni, est
// rappelé après un ajout ou une suppression : utilisé pour les 5 listes
// fixes de la colonne principale (formation/expériences/projets/compétences/
// intérêts), dont la présence dans la section « Sections » du panneau dépend
// de savoir si la liste est vide ou non (cf. `SECTIONS_FIXES`) — sans ce
// rappel, passer de 0 à 1 élément (ou l'inverse) ne mettrait pas à jour cette
// liste tant que le panneau n'est pas rechargé.
function creerSectionEditable(S, cle, cvListe, schema, onChange, onAnnuaireModifie, creerExtraLigne, apresModificationListe) {
  const conteneur = document.createElement("div");

  function rafraichir() {
    conteneur.innerHTML = "";

    const items = cvListe.map(x => ({ id: x.id, texte: schema.texte(x) }));
    const ordonnes = ordonnerSelonSelection(items, S[cle]);

    const ul = creerListeCoches(
      ordonnes,
      id => (S[cle] || []).includes(id),
      ids => { S[cle] = ids; onChange(); },
      item => {
        const fragment = document.createDocumentFragment();
        const brut = cvListe.find(x => x.id === item.id);
        if (schema.modifiable) {
          fragment.appendChild(creerActionsEntree(schema, brut, onChange, onAnnuaireModifie, rafraichir));
        }
        if (creerExtraLigne) {
          const extra = creerExtraLigne(brut);
          if (extra) fragment.appendChild(extra);
        }
        const boutonSupprimer = document.createElement("button");
        boutonSupprimer.type = "button";
        boutonSupprimer.className = "discret danger bouton-supprimer-entree";
        boutonSupprimer.textContent = "🗑 Supprimer de l’annuaire";
        boutonSupprimer.onclick = () => {
          if (!confirm(`Supprimer définitivement « ${item.texte} » de l’annuaire ?\n\nLes candidatures déjà enregistrées avec cet élément ne sont pas affectées (elles gardent leur copie), mais il disparaîtra des futurs CV.`)) return;
          retirerDeTableau(cvListe, item.id);
          if (S[cle]) S[cle] = S[cle].filter(id => id !== item.id);
          if (S.puces) delete S.puces[item.id];
          onAnnuaireModifie();
          onChange();
          rafraichir();
          apresModificationListe?.();
        };
        fragment.appendChild(boutonSupprimer);
        return fragment;
      }
    );
    conteneur.appendChild(ul);

    conteneur.appendChild(creerFormulaireAjoutEntree(schema, cvListe, nouvelleEntree => {
      cvListe.push(nouvelleEntree);
      S[cle] = [...(S[cle] || []), nouvelleEntree.id];
      onAnnuaireModifie();
      onChange();
      rafraichir();
      apresModificationListe?.();
    }));
  }
  rafraichir();

  return conteneur;
}

const SCHEMAS = {
  formations: {
    titre: "une formation",
    modifiable: true,
    champs: [
      { cle: "ecole", label: "École", requis: true },
      { cle: "lieu", label: "Lieu", bilingue: true },
      { cle: "dates", label: "Dates (ex. 2025 – 2028)", bilingue: true },
      { cle: "diplome", label: "Description", requis: true, bilingue: true }
    ],
    texteId: v => v.ecole,
    construire: (v, id) => ({
      id, ecole: v.ecole,
      lieu: valeurTexteBilingue(v.lieu.fr, v.lieu.en), dates: valeurTexteBilingue(v.dates.fr, v.dates.en),
      diplome: valeurTexteBilingue(v.diplome.fr, v.diplome.en), puces: []
    }),
    texte: f => f.ecole
  },
  experiences: {
    titre: "une expérience",
    modifiable: true,
    champs: [
      { cle: "organisation", label: "Organisation", requis: true, bilingue: true },
      { cle: "lieu", label: "Lieu", bilingue: true },
      { cle: "dates", label: "Dates", bilingue: true },
      { cle: "poste", label: "Poste", bilingue: true },
      { cle: "description", label: "Description", bilingue: true }
    ],
    texteId: v => v.organisation.fr,
    construire: (v, id) => {
      const e = {
        id, organisation: valeurTexteBilingue(v.organisation.fr, v.organisation.en),
        lieu: valeurTexteBilingue(v.lieu.fr, v.lieu.en), dates: valeurTexteBilingue(v.dates.fr, v.dates.en), puces: []
      };
      const poste = valeurTexteBilingue(v.poste.fr, v.poste.en);
      const description = valeurTexteBilingue(v.description.fr, v.description.en);
      if (poste) e.poste = poste;
      if (description) e.description = description;
      return e;
    },
    texte: e => T(e.organisation)
  },
  projets: {
    titre: "un projet",
    champs: [
      { cle: "titre", label: "Titre", requis: true, bilingue: true },
      { cle: "description", label: "Description", bilingue: true }
    ],
    texteId: v => v.titre.fr,
    construire: (v, id) => {
      const p = { id, titre: valeurTexteBilingue(v.titre.fr, v.titre.en), puces: [] };
      const description = valeurTexteBilingue(v.description.fr, v.description.en);
      if (description) p.description = description;
      return p;
    },
    texte: p => T(p.titre)
  },
  competences: {
    titre: "une compétence",
    champs: [
      { cle: "categorie", label: "Catégorie", requis: true, bilingue: true },
      { cle: "valeur", label: "Valeur", requis: true, bilingue: true }
    ],
    texteId: v => v.categorie.fr,
    construire: (v, id) => ({
      id, categorie: valeurTexteBilingue(v.categorie.fr, v.categorie.en), valeur: valeurTexteBilingue(v.valeur.fr, v.valeur.en)
    }),
    texte: c => T(c.categorie)
  },
  langues: {
    titre: "une langue",
    champs: [
      { cle: "nom", label: "Langue", requis: true, bilingue: true },
      { cle: "niveau", label: "Niveau (ex. B2)", requis: true, bilingue: true }
    ],
    texteId: v => v.nom.fr,
    construire: (v, id) => ({
      id, fr: v.nom.fr, en: v.nom.en || v.nom.fr, niveau: valeurTexteBilingue(v.niveau.fr, v.niveau.en)
    }),
    texte: l => T(l)
  },
  interets: {
    titre: "un centre d’intérêt",
    champs: [
      { cle: "texte", label: "Centre d’intérêt", requis: true, bilingue: true },
      { cle: "detail", label: "Détail (optionnel, affiché après « : »)", bilingue: true }
    ],
    texteId: v => v.texte.fr,
    construire: (v, id) => {
      const i = { id, fr: v.texte.fr, en: v.texte.en || v.texte.fr };
      const detail = valeurTexteBilingue(v.detail.fr, v.detail.en);
      if (detail) i.detail = detail;
      return i;
    },
    texte: i => T(i)
  }
};

// Sous-titre à l'intérieur d'une section du panneau qui regroupe plusieurs
// listes (ex. « Projets et compétences »).
function creerSousTitreSection(texte) {
  const h4 = document.createElement("h4");
  h4.className = "sous-titre-section";
  h4.textContent = texte;
  return h4;
}

const EXTENSIONS_PHOTO_AUTORISEES = ["jpg", "jpeg", "png", "webp"];
const TAILLE_MAX_PHOTO = 2 * 1024 * 1024; // 2 Mo, doit rester cohérent avec server.py

// Photo de profil : envoi (JSON+base64 vers PUT /api/photo, même mécanisme
// que les documents joints des candidatures) et retrait (DELETE /api/photo).
// Le serveur écrit déjà le fichier et met à jour data/cv.json de son côté ;
// ici on ne fait que refléter le nouveau chemin dans CV.identite.photo
// (déjà le même objet que celui envoyé par les prochains enregistrements),
// pour ne pas écraser la photo au prochain enregistrement d'une autre section.
function creerChampPhoto(I, onChange) {
  const conteneur = document.createElement("div");
  conteneur.className = "champ-photo";

  const ligne = document.createElement("div");
  ligne.className = "ligne-photo";

  const apercu = document.createElement("img");
  apercu.className = "photo-apercu";
  apercu.alt = "";
  apercu.hidden = !I.photo;
  if (I.photo) apercu.src = "/" + I.photo + "?v=" + Date.now();

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

  const boutonRetirer = document.createElement("button");
  boutonRetirer.type = "button";
  boutonRetirer.className = "discret danger";
  boutonRetirer.textContent = "Retirer la photo";
  boutonRetirer.hidden = !I.photo;

  const message = document.createElement("p");
  message.className = "message-photo";
  message.hidden = true;
  const afficherMessage = texte => { message.textContent = texte; message.hidden = false; };

  input.onchange = async () => {
    message.hidden = true;
    const fichier = input.files[0];
    if (!fichier) return;
    const extension = (fichier.name.split(".").pop() || "").toLowerCase();
    if (!EXTENSIONS_PHOTO_AUTORISEES.includes(extension)) {
      afficherMessage("Format non supporté : utilise un fichier jpg, jpeg, png ou webp.");
      input.value = "";
      return;
    }
    if (fichier.size > TAILLE_MAX_PHOTO) {
      afficherMessage("Image trop volumineuse (2 Mo maximum).");
      input.value = "";
      return;
    }
    try {
      const contenuBase64 = await fichierEnBase64(fichier);
      const { photo } = await api.enregistrerPhoto({ nomOriginal: fichier.name, contenuBase64 });
      I.photo = photo;
      apercu.src = "/" + photo + "?v=" + Date.now();
      apercu.hidden = false;
      boutonRetirer.hidden = false;
      onChange();
    } catch (erreur) {
      afficherMessage("Impossible d’envoyer la photo : " + erreur.message);
    } finally {
      input.value = "";
    }
  };

  boutonRetirer.onclick = async () => {
    if (!confirm("Retirer la photo ?")) return;
    try {
      await api.supprimerPhoto();
      I.photo = "";
      apercu.hidden = true;
      apercu.removeAttribute("src");
      boutonRetirer.hidden = true;
      onChange();
    } catch (erreur) {
      alert("Impossible de retirer la photo : " + erreur.message);
    }
  };

  ligne.append(apercu, input);
  conteneur.append(ligne, boutonRetirer, message);
  return conteneur;
}

// « Mes informations » : identité (CV.identite) éditable directement depuis
// le panneau. Champs simples mis à jour en direct (onChange) et persistés
// sur le serveur au blur (événement « change », pas à chaque frappe).
// Ville/Téléphone/E-mail/LinkedIn/Permis conditionnent aussi la liste des
// coordonnées disponibles dans la section « Coordonnées » (cf.
// `coordonneeFixeVide`) : un champ qui passe de vide à rempli (ou l'inverse)
// doit donc rafraîchir cette section-là (via `rafraichirCoordonnees`, pas un
// rebuild du panneau entier — sinon le champ qu'on est en train de quitter
// détruit son propre remplaçant au moment même où le focus s'y déplace).
function creerSectionIdentite(S, CV, onChange, onAnnuaireModifie, rafraichirCoordonnees) {
  const conteneur = document.createElement("div");
  conteneur.className = "champs-identite";
  const I = CV.identite;

  // Une coordonnée fixe qui vient de passer de vide à remplie n'a jamais pu
  // être cochée (elle n'existait pas encore dans la liste « Coordonnées ») :
  // on la coche donc automatiquement, sinon elle réapparaît décochée et rien
  // ne change sur le CV tant qu'on ne va pas la cocher à la main.
  const cocherAutomatiquement = id => {
    if (!coordonneeFixeVide(CV, id) && !(S.contact || []).includes(id)) {
      S.contact = [...(S.contact || []), id];
    }
  };

  const champ = (placeholder, cle, type = "text", affecteCoordonnees = false) => {
    const input = document.createElement("input");
    input.type = type;
    input.placeholder = placeholder;
    input.value = I[cle] || "";
    input.oninput = () => { I[cle] = input.value; onChange(); };
    input.addEventListener("change", () => {
      onAnnuaireModifie();
      if (affecteCoordonnees) {
        cocherAutomatiquement(cle);
        onChange();
        rafraichirCoordonnees();
      }
    });
    return input;
  };

  conteneur.append(
    champ("Prénom", "prenom"),
    champ("Nom", "nom"),
    champ("Ville", "ville", "text", true),
    champ("Téléphone", "telephone", "tel", true),
    champ("E-mail", "email", "email", true),
    champ("LinkedIn (texte affiché)", "linkedin", "text", true),
    champ("LinkedIn (URL)", "linkedinUrl", "url")
  );

  const permisInit = (I.permis && typeof I.permis === "object") ? I.permis : { fr: I.permis || "", en: "" };
  const groupePermis = document.createElement("div");
  groupePermis.className = "champ-bilingue";
  const permisFr = document.createElement("input");
  permisFr.type = "text"; permisFr.placeholder = "Permis (français)"; permisFr.value = permisInit.fr;
  const permisEn = document.createElement("input");
  permisEn.type = "text"; permisEn.placeholder = "Permis (anglais, optionnel)"; permisEn.value = permisInit.en;
  const surSaisiePermis = () => { I.permis = valeurTexteBilingue(permisFr.value, permisEn.value); onChange(); };
  const surValidationPermis = () => {
    onAnnuaireModifie();
    cocherAutomatiquement("permis");
    onChange();
    rafraichirCoordonnees();
  };
  permisFr.oninput = surSaisiePermis;
  permisEn.oninput = surSaisiePermis;
  permisFr.addEventListener("change", surValidationPermis);
  permisEn.addEventListener("change", surValidationPermis);
  groupePermis.append(permisFr, permisEn);
  conteneur.appendChild(groupePermis);

  conteneur.appendChild(creerChampPhoto(I, onChange));

  return conteneur;
}

function creerSectionTitre(S, CV, onChange, onAnnuaireModifie) {
  const conteneur = document.createElement("div");

  function rafraichir() {
    conteneur.innerHTML = "";
    const champTitre = document.createElement("div");
    champTitre.className = "champ-titre";

    const optionAucun = document.createElement("label");
    optionAucun.className = "option-titre";
    const radioAucun = document.createElement("input");
    radioAucun.type = "radio";
    radioAucun.name = "titre-variante";
    radioAucun.checked = !S.titre;
    radioAucun.onchange = () => { S.titre = null; onChange(); };
    optionAucun.append(radioAucun, " (Aucun)");
    champTitre.appendChild(optionAucun);

    for (const t of CV.titres) {
      const ligne = document.createElement("div");
      ligne.className = "option-titre-ligne";

      const label = document.createElement("label");
      label.className = "option-titre";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "titre-variante";
      radio.checked = S.titre === t.id;
      radio.onchange = () => { S.titre = t.id; onChange(); };
      label.append(radio, " " + T(t));
      ligne.appendChild(label);

      const boutonSupprimer = document.createElement("button");
      boutonSupprimer.type = "button";
      boutonSupprimer.className = "discret danger";
      boutonSupprimer.textContent = "🗑";
      boutonSupprimer.title = "Supprimer cette variante de titre";
      boutonSupprimer.onclick = () => {
        if (!confirm(`Supprimer la variante de titre « ${T(t)} » ?`)) return;
        retirerDeTableau(CV.titres, t.id);
        if (S.titre === t.id) S.titre = null;
        onAnnuaireModifie();
        onChange();
        rafraichir();
      };
      ligne.appendChild(boutonSupprimer);
      champTitre.appendChild(ligne);
    }

    const libre = document.createElement("input");
    libre.type = "text";
    libre.placeholder = "Titre libre (remplace le choix ci-dessus)";
    libre.className = "champ-titre-libre";
    libre.value = S.titreLibre || "";
    libre.oninput = () => { S.titreLibre = libre.value; onChange(); };
    champTitre.appendChild(libre);

    conteneur.appendChild(champTitre);

    const form = document.createElement("form");
    form.className = "formulaire-entree";
    const champFr = document.createElement("input");
    champFr.type = "text"; champFr.placeholder = "Nouveau titre (français)"; champFr.required = true;
    const champEn = document.createElement("input");
    champEn.type = "text"; champEn.placeholder = "Anglais (optionnel)";
    const boutonAjouter = document.createElement("button");
    boutonAjouter.type = "submit"; boutonAjouter.textContent = "+ Ajouter un titre";
    form.append(champFr, champEn, boutonAjouter);
    form.onsubmit = evt => {
      evt.preventDefault();
      const fr = champFr.value.trim();
      if (!fr) return;
      const en = champEn.value.trim();
      const id = genererId(CV.titres, fr, "titre");
      CV.titres.push({ id, fr, en: en || fr });
      onAnnuaireModifie();
      onChange();
      rafraichir();
    };
    conteneur.appendChild(form);
  }

  rafraichir();
  return conteneur;
}

const ICONES_DISPONIBLES = [
  { id: "pin", label: "Épingle (lieu)" },
  { id: "phone", label: "Téléphone" },
  { id: "mail", label: "Enveloppe (e-mail)" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "car", label: "Voiture (permis)" }
];

// Les 5 coordonnées fixes sont vides une fois leur champ d'identité effacé
// (cf. `effacerCoordonneeFixe`) : elles disparaissent alors de la liste,
// comme une coordonnée personnalisée supprimée.
function coordonneeFixeVide(CV, id) {
  const I = CV.identite;
  if (id === "permis") return !I.permis || (typeof I.permis === "object" && !I.permis.fr && !I.permis.en);
  return !I[id];
}

function effacerCoordonneeFixe(CV, id) {
  CV.identite[id] = "";
  if (id === "linkedin") CV.identite.linkedinUrl = "";
}

// Coordonnées : 5 champs fixes (liés à l'identité) + des coordonnées
// personnalisées librement ajoutables (libellé, icône, texte, lien optionnel).
function creerSectionCoordonnees(S, CV, onChange, onAnnuaireModifie, hooks) {
  const conteneur = document.createElement("div");
  CV.identite.coordonneesPersonnalisees = CV.identite.coordonneesPersonnalisees || [];

  function rafraichir() {
    conteneur.innerHTML = "";
    const fixes = [
      { id: "ville", texte: "Ville" },
      { id: "telephone", texte: "Téléphone" },
      { id: "email", texte: "E-mail" },
      { id: "linkedin", texte: "LinkedIn" },
      { id: "permis", texte: "Permis" }
    ].filter(f => !coordonneeFixeVide(CV, f.id));
    const perso = CV.identite.coordonneesPersonnalisees.map(c => ({ id: c.id, texte: c.libelle }));
    const ordonnes = ordonnerSelonSelection([...fixes, ...perso], S.contact);

    const ul = creerListeCoches(
      ordonnes,
      id => (S.contact || []).includes(id),
      ids => { S.contact = ids; onChange(); },
      item => {
        const estPerso = CV.identite.coordonneesPersonnalisees.some(c => c.id === item.id);
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "discret danger bouton-supprimer-entree";
        bouton.textContent = "🗑 Supprimer cette coordonnée";
        bouton.onclick = () => {
          const avertissement = estPerso ? "" :
            "\n\nCeci efface aussi la valeur correspondante dans tes informations personnelles (tu pourras la resaisir dans data/cv.json).";
          if (!confirm(`Supprimer la coordonnée « ${item.texte} » ?${avertissement}`)) return;
          if (estPerso) retirerDeTableau(CV.identite.coordonneesPersonnalisees, item.id);
          else effacerCoordonneeFixe(CV, item.id);
          S.contact = (S.contact || []).filter(id => id !== item.id);
          onAnnuaireModifie();
          onChange();
          rafraichir();
        };
        return bouton;
      }
    );
    conteneur.appendChild(ul);

    const form = document.createElement("form");
    form.className = "formulaire-entree";
    const champLibelle = document.createElement("input");
    champLibelle.type = "text"; champLibelle.placeholder = "Libellé (ex. Site web)"; champLibelle.required = true;
    const champTexte = document.createElement("input");
    champTexte.type = "text"; champTexte.placeholder = "Texte affiché (ex. mon-site.fr)"; champTexte.required = true;
    const champLien = document.createElement("input");
    champLien.type = "url"; champLien.placeholder = "Lien (optionnel, https://…)";
    const selectIcone = document.createElement("select");
    for (const ic of ICONES_DISPONIBLES) selectIcone.appendChild(new Option(ic.label, ic.id));
    const boutonAjouter = document.createElement("button");
    boutonAjouter.type = "submit"; boutonAjouter.textContent = "+ Ajouter une coordonnée";
    form.append(champLibelle, champTexte, champLien, selectIcone, boutonAjouter);
    form.onsubmit = evt => {
      evt.preventDefault();
      const libelle = champLibelle.value.trim();
      const texte = champTexte.value.trim();
      if (!libelle || !texte) return;
      const id = genererId(CV.identite.coordonneesPersonnalisees, libelle, "coordonnee");
      CV.identite.coordonneesPersonnalisees.push({
        id, libelle, texte, lien: champLien.value.trim(), icone: selectIcone.value
      });
      S.contact = [...(S.contact || []), id];
      onAnnuaireModifie();
      onChange();
      rafraichir();
    };
    conteneur.appendChild(form);
  }

  rafraichir();
  if (hooks) hooks.rafraichir = rafraichir;
  return conteneur;
}

// Sections (colonne principale) : 4 sections fixes + des sections
// personnalisées librement ajoutables (titre + liste de cartes titre/description,
// comme Projets). `onSectionsChangees` reconstruit tout le panneau, car ajouter/
// supprimer une section change le nombre d'accordéons dédiés à afficher.
// Sections fixes : id de la section → clé de la liste correspondante dans
// l'annuaire (« formation » se lit CV.formations, mais les autres coïncident).
const SECTIONS_FIXES = [
  { id: "formation", cvCle: "formations" },
  { id: "experiences", cvCle: "experiences" },
  { id: "projets", cvCle: "projets" },
  { id: "competences", cvCle: "competences" },
  { id: "interets", cvCle: "interets" }
];

function creerSectionSections(S, CV, onChange, onAnnuaireModifie, onSectionsChangees, hooks) {
  const conteneur = document.createElement("div");
  CV.sectionsPersonnalisees = CV.sectionsPersonnalisees || [];

  function rafraichir() {
    conteneur.innerHTML = "";
    // Une section fixe disparaît de la liste une fois son contenu entièrement
    // supprimé (comme une coordonnée fixe vidée) : elle redevient un id libre.
    const fixes = SECTIONS_FIXES
      .filter(f => (CV[f.cvCle] || []).length > 0)
      .map(f => ({ id: f.id, texte: LABELS[f.id].fr }));
    const perso = CV.sectionsPersonnalisees.map(s => ({ id: s.id, texte: T(s.titre) }));
    const ordonnes = ordonnerSelonSelection([...fixes, ...perso], S.sections);

    const ul = creerListeCoches(
      ordonnes,
      id => (S.sections || []).includes(id),
      ids => { S.sections = ids; onChange(); },
      item => {
        const estPerso = CV.sectionsPersonnalisees.some(s => s.id === item.id);
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "discret danger bouton-supprimer-entree";
        bouton.textContent = "🗑 Supprimer cette section (et son contenu)";
        bouton.onclick = () => {
          if (!confirm(`Supprimer définitivement la section « ${item.texte} » et tout son contenu ? Cette action est irréversible.`)) return;
          if (estPerso) {
            retirerDeTableau(CV.sectionsPersonnalisees, item.id);
          } else {
            const fixe = SECTIONS_FIXES.find(f => f.id === item.id);
            CV[fixe.cvCle] = [];
          }
          S.sections = (S.sections || []).filter(id => id !== item.id);
          delete S[item.id];
          onAnnuaireModifie();
          onChange();
          onSectionsChangees();
        };
        return bouton;
      }
    );
    conteneur.appendChild(ul);

    const form = document.createElement("form");
    form.className = "formulaire-entree";
    const champFr = document.createElement("input");
    champFr.type = "text"; champFr.placeholder = "Nom de la nouvelle section (français)"; champFr.required = true;
    const champEn = document.createElement("input");
    champEn.type = "text"; champEn.placeholder = "Anglais (optionnel)";
    const boutonAjouter = document.createElement("button");
    boutonAjouter.type = "submit"; boutonAjouter.textContent = "+ Ajouter une section";
    form.append(champFr, champEn, boutonAjouter);
    form.onsubmit = evt => {
      evt.preventDefault();
      const fr = champFr.value.trim();
      if (!fr) return;
      const en = champEn.value.trim();
      const id = genererId(CV.sectionsPersonnalisees, fr, "section");
      CV.sectionsPersonnalisees.push({ id, titre: en ? { fr, en } : fr, items: [] });
      S.sections = [...(S.sections || []), id];
      S[id] = [];
      onAnnuaireModifie();
      onChange();
      onSectionsChangees();
    };
    conteneur.appendChild(form);
  }

  rafraichir();
  if (hooks) hooks.rafraichir = rafraichir;
  return conteneur;
}

export function construirePanneau(panel, CV, S, onChange, onAnnuaireModifie) {
  panel.innerHTML = "";

  const carteRapide = document.createElement("div");
  carteRapide.className = "carte-reglages-rapides";

  const grModele = document.createElement("div");
  grModele.className = "groupe-reglage";
  grModele.append(
    creerLibelleGroupe("Modèle"),
    creerBoutonsSegment(
      [{ value: "sobre", label: "Sobre" }, { value: "visuel", label: "Visuel" }],
      () => S.template, v => { S.template = v; }, onChange
    )
  );
  carteRapide.appendChild(grModele);

  const grLangue = document.createElement("div");
  grLangue.className = "groupe-reglage";
  grLangue.append(
    creerLibelleGroupe("Langue"),
    creerBoutonsSegment(
      [{ value: "fr", label: "FR" }, { value: "en", label: "EN" }],
      () => S.langue, v => { S.langue = v; }, onChange
    )
  );
  carteRapide.appendChild(grLangue);

  const grCompact = document.createElement("div");
  grCompact.className = "groupe-reglage";
  grCompact.append(
    creerLibelleGroupe("Mode compact"),
    creerBoutonsSegment(
      [{ value: false, label: "Non" }, { value: true, label: "Oui" }],
      () => S.compact, v => { S.compact = v; }, onChange
    )
  );
  carteRapide.appendChild(grCompact);

  panel.appendChild(carteRapide);

  const rafraichirPanneauEntier = () => construirePanneau(panel, CV, S, onChange, onAnnuaireModifie);

  // `hooksCoordonnees.rafraichir` n'est renseigné qu'une fois la section
  // Coordonnées construite plus bas ; l'identité ne l'appelle que sur un
  // évènement "change" (blur), donc bien après que le panneau entier existe.
  const hooksCoordonnees = {};
  panel.appendChild(creerSection("Mes informations",
    creerSectionIdentite(S, CV, onChange, onAnnuaireModifie, () => hooksCoordonnees.rafraichir?.())));

  panel.appendChild(creerSection("Titre", creerSectionTitre(S, CV, onChange, onAnnuaireModifie)));

  // Même mécanisme que hooksCoordonnees : les 5 listes fixes (formation,
  // expériences, projets, compétences, intérêts) doivent pouvoir rafraîchir
  // la liste « Sections » quand leur premier élément est ajouté (ou leur
  // dernier supprimé), sans reconstruire tout le panneau.
  const hooksSections = {};
  const surModificationListeFixe = () => hooksSections.rafraichir?.();

  panel.appendChild(creerSection("Coordonnées",
    creerSectionCoordonnees(S, CV, onChange, onAnnuaireModifie, hooksCoordonnees)));
  panel.appendChild(creerSection("Sections (colonne principale)",
    creerSectionSections(S, CV, onChange, onAnnuaireModifie, rafraichirPanneauEntier, hooksSections)));

  for (const section of CV.sectionsPersonnalisees || []) {
    panel.appendChild(creerSection(T(section.titre), creerSectionEditable(
      S, section.id, section.items, { ...SCHEMAS.projets, titre: "un élément" }, onChange, onAnnuaireModifie
    )));
  }

  panel.appendChild(creerSection("Formation", creerSectionEditable(
    S, "formation", CV.formations, SCHEMAS.formations, onChange, onAnnuaireModifie,
    item => creerExtraPuces(S, item, onChange, onAnnuaireModifie), surModificationListeFixe
  )));

  panel.appendChild(creerSection("Expériences", creerSectionEditable(
    S, "experiences", CV.experiences, SCHEMAS.experiences, onChange, onAnnuaireModifie,
    item => creerExtraPuces(S, item, onChange, onAnnuaireModifie), surModificationListeFixe
  )));

  const projetsEtCompetences = document.createElement("div");
  projetsEtCompetences.append(
    creerSousTitreSection("Projets"),
    creerSectionEditable(S, "projets", CV.projets, SCHEMAS.projets, onChange, onAnnuaireModifie,
      item => creerExtraPuces(S, item, onChange, onAnnuaireModifie), surModificationListeFixe),
    creerSousTitreSection("Compétences"),
    creerSectionEditable(S, "competences", CV.competences, SCHEMAS.competences, onChange, onAnnuaireModifie,
      null, surModificationListeFixe)
  );
  panel.appendChild(creerSection("Projets et compétences", projetsEtCompetences));

  panel.appendChild(creerSection("Langues", creerSectionEditable(
    S, "langues", CV.langues, SCHEMAS.langues, onChange, onAnnuaireModifie
  )));

  const grAffichageInterets = document.createElement("div");
  grAffichageInterets.className = "groupe-reglage";
  grAffichageInterets.append(
    creerLibelleGroupe("Affichage"),
    creerBoutonsSegment(
      [{ value: "phrase", label: "Phrase" }, { value: "liste", label: "Liste" }],
      () => S.interetsAffichage, v => { S.interetsAffichage = v; }, onChange
    )
  );
  const conteneurInterets = document.createElement("div");
  conteneurInterets.append(
    grAffichageInterets,
    creerSectionEditable(S, "interets", CV.interets, SCHEMAS.interets, onChange, onAnnuaireModifie,
      null, surModificationListeFixe)
  );
  panel.appendChild(creerSection("Centres d’intérêt", conteneurInterets));
}
