/* ============================================================
   Vue ATS (page d'accueil) : liste des candidatures, filtre par
   statut, création d'une candidature, gestion des statuts
   personnalisés (libres, aucun par défaut).
   ============================================================ */
import { api } from "./api.js";
import { creerEtoiles } from "./etoiles.js";

const PALETTE = ["#1e3a78", "#2d6a3e", "#b45309", "#7c3aed", "#0e7490", "#be123c", "#4d7c0f", "#a16207"];

const corpsTable = document.getElementById("corps-table");
const messageVide = document.getElementById("message-vide");
const messageErreur = document.getElementById("message-erreur");
const filtreStatut = document.getElementById("filtre-statut");
const filtreDateDebut = document.getElementById("filtre-date-debut");
const filtreDateFin = document.getElementById("filtre-date-fin");
const selecteurTri = document.getElementById("tri");

let statuts = [];
let candidatures = [];

function afficherErreur(erreur) {
  messageErreur.textContent = erreur.message || String(erreur);
  messageErreur.hidden = false;
}

function slugifier(texte) {
  return texte
    .normalize("NFKD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "statut";
}

function idStatutUnique(nom) {
  const base = slugifier(nom);
  let id = base, n = 2;
  while (statuts.some(s => s.id === id)) { id = `${base}-${n}`; n++; }
  return id;
}

function statutParId(id) {
  return statuts.find(s => s.id === id) || null;
}

function formaterDate(iso) {
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

function creerBadgeStatut(statutId) {
  const span = document.createElement("span");
  span.className = "badge-statut";
  const statut = statutParId(statutId);
  if (statut) {
    span.textContent = statut.nom;
    span.style.setProperty("--couleur-badge", statut.couleur || "#6b7081");
  } else {
    span.textContent = "Sans statut";
    span.classList.add("badge-statut-vide");
  }
  return span;
}

function rafraichirFiltre() {
  const valeurCourante = filtreStatut.value;
  filtreStatut.innerHTML = "";
  filtreStatut.appendChild(new Option("Tous les statuts", ""));
  filtreStatut.appendChild(new Option("Sans statut", "__aucun__"));
  for (const s of statuts) filtreStatut.appendChild(new Option(s.nom, s.id));
  filtreStatut.value = [...filtreStatut.options].some(o => o.value === valeurCourante) ? valeurCourante : "";
}

function rafraichirTable() {
  const filtre = filtreStatut.value;
  const debut = filtreDateDebut.value;
  const fin = filtreDateFin.value;

  let visibles = candidatures.filter(c => {
    if (filtre === "__aucun__" ? !!c.statutId : filtre && c.statutId !== filtre) return false;
    if (debut && c.dateCreation < debut) return false;
    if (fin && c.dateCreation > fin) return false;
    return true;
  });
  // Déjà triées par dernière activité (le plus récent d'abord) côté serveur.
  if (selecteurTri.value === "note") {
    visibles = [...visibles].sort((a, b) => (b.note || 0) - (a.note || 0));
  }

  corpsTable.innerHTML = "";
  for (const c of visibles) {
    const tr = document.createElement("tr");

    const tdEntreprise = document.createElement("td");
    const lien = document.createElement("a");
    lien.href = `candidature.html?id=${encodeURIComponent(c.id)}`;
    lien.textContent = c.entreprise;
    tdEntreprise.appendChild(lien);
    tr.appendChild(tdEntreprise);

    const tdPoste = document.createElement("td");
    tdPoste.textContent = c.poste || "—";
    tr.appendChild(tdPoste);

    const tdStatut = document.createElement("td");
    tdStatut.appendChild(creerBadgeStatut(c.statutId));
    tr.appendChild(tdStatut);

    const tdNote = document.createElement("td");
    tdNote.textContent = c.note ? `${c.note}/10` : "—";
    tr.appendChild(tdNote);

    const tdActivite = document.createElement("td");
    tdActivite.textContent = formaterDate(c.derniereActivite);
    tr.appendChild(tdActivite);

    const tdDateCreation = document.createElement("td");
    tdDateCreation.textContent = formaterDate(c.dateCreation);
    tr.appendChild(tdDateCreation);

    const tdActions = document.createElement("td");
    const boutonSupprimer = document.createElement("button");
    boutonSupprimer.type = "button";
    boutonSupprimer.className = "danger discret";
    boutonSupprimer.textContent = "Supprimer";
    boutonSupprimer.onclick = () => supprimerCandidature(c);
    tdActions.appendChild(boutonSupprimer);
    tr.appendChild(tdActions);

    corpsTable.appendChild(tr);
  }
  messageVide.hidden = visibles.length > 0;
  messageVide.textContent = candidatures.length > 0
    ? "Aucune candidature ne correspond à ce filtre."
    : "Aucune candidature pour l’instant. Clique sur « + Nouvelle candidature » pour commencer.";
}

async function supprimerCandidature(c) {
  if (!confirm(`Supprimer la candidature « ${c.entreprise} » ? Cette action est irréversible.`)) return;
  try {
    await api.supprimerCandidature(c.id);
    candidatures = candidatures.filter(x => x.id !== c.id);
    rafraichirTable();
  } catch (erreur) {
    afficherErreur(erreur);
  }
}

// ---------- Dialogue « Nouvelle candidature » ----------
const dialogueNouvelle = document.getElementById("dialogue-nouvelle");
const formulaireNouvelle = document.getElementById("formulaire-nouvelle");
const etoilesNouvelle = creerEtoiles(0);
document.getElementById("etoiles-nouvelle").appendChild(etoilesNouvelle.element);

document.getElementById("bouton-nouvelle").onclick = () => {
  formulaireNouvelle.reset();
  etoilesNouvelle.definir(0);
  dialogueNouvelle.showModal();
};
dialogueNouvelle.querySelector("[data-annuler]").onclick = () => dialogueNouvelle.close();
formulaireNouvelle.onsubmit = async evt => {
  evt.preventDefault();
  const donnees = Object.fromEntries(new FormData(formulaireNouvelle));
  donnees.note = etoilesNouvelle.valeur();
  try {
    const candidature = await api.creerCandidature(donnees);
    window.location.href = `candidature.html?id=${encodeURIComponent(candidature.id)}`;
  } catch (erreur) {
    afficherErreur(erreur);
  }
};

document.getElementById("bouton-editeur-libre").onclick = () => { window.location.href = "editeur.html"; };

// ---------- Dialogue « Gérer les statuts » ----------
const dialogueStatuts = document.getElementById("dialogue-statuts");
const listeStatuts = document.getElementById("liste-statuts");
const formulaireStatut = document.getElementById("formulaire-statut");

function rafraichirListeStatuts() {
  listeStatuts.innerHTML = "";
  for (const s of statuts) {
    const li = document.createElement("li");
    const puce = document.createElement("span");
    puce.className = "puce-couleur";
    puce.style.setProperty("--couleur-badge", s.couleur || "#6b7081");
    li.appendChild(puce);
    const nom = document.createElement("span");
    nom.className = "nom-statut";
    nom.textContent = s.nom;
    li.appendChild(nom);
    const boutonSupprimer = document.createElement("button");
    boutonSupprimer.type = "button";
    boutonSupprimer.className = "danger discret";
    boutonSupprimer.textContent = "Supprimer";
    boutonSupprimer.onclick = () => supprimerStatut(s.id);
    li.appendChild(boutonSupprimer);
    listeStatuts.appendChild(li);
  }
}

async function supprimerStatut(id) {
  const enUsage = candidatures.some(c => c.statutId === id);
  if (enUsage && !confirm("Ce statut est utilisé par au moins une candidature, qui repassera « sans statut ». Continuer ?")) return;
  statuts = statuts.filter(s => s.id !== id);
  await api.enregistrerStatuts(statuts);
  rafraichirListeStatuts();
  rafraichirFiltre();
  rafraichirTable();
}

document.getElementById("bouton-gerer-statuts").onclick = () => {
  rafraichirListeStatuts();
  dialogueStatuts.showModal();
};
dialogueStatuts.querySelector("[data-fermer]").onclick = () => dialogueStatuts.close();
formulaireStatut.onsubmit = async evt => {
  evt.preventDefault();
  const nom = new FormData(formulaireStatut).get("nom").trim();
  if (!nom) return;
  const couleur = PALETTE[statuts.length % PALETTE.length];
  statuts.push({ id: idStatutUnique(nom), nom, couleur });
  try {
    await api.enregistrerStatuts(statuts);
    formulaireStatut.reset();
    rafraichirListeStatuts();
    rafraichirFiltre();
    rafraichirTable();
  } catch (erreur) {
    afficherErreur(erreur);
  }
};

filtreStatut.onchange = rafraichirTable;
filtreDateDebut.onchange = rafraichirTable;
filtreDateFin.onchange = rafraichirTable;
selecteurTri.onchange = rafraichirTable;

async function init() {
  try {
    [statuts, candidatures] = await Promise.all([api.statuts(), api.candidatures()]);
    rafraichirFiltre();
    rafraichirTable();
  } catch (erreur) {
    afficherErreur(erreur);
  }
}

init();
