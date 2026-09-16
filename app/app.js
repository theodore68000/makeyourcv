/* ============================================================
   Orchestration de l'aperçu : charge l'annuaire depuis le serveur,
   construit le panneau de réglages (controls.js), affiche le CV
   (render.js) et gère le contrôle « tient sur une page ».

   Peut être utilisé seul (démo, sélection par défaut) ou lié à
   une candidature via l'URL :
     ?candidature=<id>                 charge/édite le CV de cette candidature
     ?candidature=<id>&lecture=seule   relit le CV tel qu'envoyé (lecture seule)
     ?candidature=<id>&copierDe=<id2>  reprend la sélection d'une autre candidature
   ============================================================ */
import { renderSobre, renderVisuel } from "./render.js";
import { paginerSobre, paginerVisuel } from "./pagination.js";
import { construirePanneau } from "./controls.js";
import { api } from "./api.js";

// Sélection « tout coché », construite depuis l'annuaire courant : sert de
// secours quand il n'y a pas encore de sélection propre (premier lancement,
// candidature sans CV), pour ne jamais afficher une page vide — y compris
// avec l'annuaire d'exemple fourni sur GitHub, dont les id ne correspondent
// à aucune sélection préexistante.
function selectionToutSelectionnee(CV) {
  const I = CV.identite;
  const valeurNonVide = v => {
    if (!v) return false;
    if (typeof v === "object") return !!(v.fr || v.en);
    return true;
  };
  const contactFixe = [["ville", I.ville], ["telephone", I.telephone], ["email", I.email], ["linkedin", I.linkedin], ["permis", I.permis]]
    .filter(([, valeur]) => valeurNonVide(valeur))
    .map(([id]) => id);
  const contactPerso = (I.coordonneesPersonnalisees || []).map(c => c.id);

  const sectionsPerso = CV.sectionsPersonnalisees || [];
  const S = {
    template: "sobre",          // "sobre" | "visuel"
    langue: "fr",                // "fr" | "en"
    compactNiveau: 1,             // 1 = normal, 2 à 6 = espacements et texte de plus en plus réduits
    titre: (CV.titres[0] && CV.titres[0].id) || null,  // id dans CV.titres, ou null
    titreLibre: "",                // si rempli, remplace le titre ci-dessus
    contact: [...contactFixe, ...contactPerso],
    sections: ["formation", "experiences", "projets", "competences", "interets", ...sectionsPerso.map(s => s.id)],
    formation: CV.formations.map(f => f.id),
    experiences: CV.experiences.map(e => e.id),
    projets: CV.projets.map(p => p.id),
    competences: CV.competences.map(c => c.id),
    langues: CV.langues.map(l => l.id),
    interets: CV.interets.map(i => i.id),
    interetsAffichage: "phrase", // "phrase" (une phrase) | "liste" (une ligne par centre, titre en gras)
    puces: {}                    // {} = toutes les puces de chaque élément
  };
  for (const section of sectionsPerso) {
    S[section.id] = (section.items || []).map(it => it.id);
  }
  return S;
}

// Filtre une sélection sauvegardée contre l'annuaire actuel : les id qui
// n'existent plus sont retirés et remontés dans `manquants`.
function reconcilierSelection(CV, brute) {
  const manquants = [];
  const S = JSON.parse(JSON.stringify(brute));

  const idsDe = liste => new Set((liste || []).map(x => x.id));
  const filtrer = (ids, existants) => {
    const gardes = [];
    for (const id of (ids || [])) {
      if (existants.has(id)) gardes.push(id); else manquants.push(id);
    }
    return gardes;
  };

  S.formation = filtrer(S.formation, idsDe(CV.formations));
  S.experiences = filtrer(S.experiences, idsDe(CV.experiences));
  S.projets = filtrer(S.projets, idsDe(CV.projets));
  S.competences = filtrer(S.competences, idsDe(CV.competences));
  S.langues = filtrer(S.langues, idsDe(CV.langues));
  S.interets = filtrer(S.interets, idsDe(CV.interets));

  if (S.titre && !CV.titres.some(t => t.id === S.titre)) {
    manquants.push(S.titre);
    S.titre = null;
  }

  const itemsAPuces = new Map([...CV.formations, ...CV.experiences, ...CV.projets].map(it => [it.id, it]));
  const puces = {};
  for (const [itemId, idsPuces] of Object.entries(S.puces || {})) {
    const item = itemsAPuces.get(itemId);
    if (!item) { manquants.push(itemId); continue; }
    puces[itemId] = filtrer(idsPuces, idsDe(item.puces));
  }
  S.puces = puces;

  // Coordonnées et sections personnalisées : ids valides = les fixes + celles
  // qui existent encore dans l'annuaire actuel.
  const idsContactValides = new Set([
    "ville", "telephone", "email", "linkedin", "permis",
    ...(CV.identite.coordonneesPersonnalisees || []).map(c => c.id)
  ]);
  S.contact = filtrer(S.contact, idsContactValides);

  const sectionsPerso = CV.sectionsPersonnalisees || [];
  const idsSectionsValides = new Set(["formation", "experiences", "projets", "competences", "interets", ...sectionsPerso.map(s => s.id)]);
  S.sections = filtrer(S.sections, idsSectionsValides);
  for (const section of sectionsPerso) {
    if (S[section.id]) S[section.id] = filtrer(S[section.id], idsDe(section.items));
  }

  return { S, manquants };
}

const parametres = new URLSearchParams(window.location.search);
const candidatureId = parametres.get("candidature");
const lectureSeule = parametres.get("lecture") === "seule";
const copierDeId = parametres.get("copierDe");

let CV = null;
let S = null;

const page = document.getElementById("page");
const panel = document.getElementById("panel");
const statut = document.getElementById("status");
const suggestionCompact = document.getElementById("suggestion-compact");
const bandeauCandidature = document.getElementById("bandeau-candidature");
const boutonEnregistrer = document.getElementById("bouton-enregistrer-candidature");

function render() {
  if (!S) return; // appelé aussi via document.fonts.ready, qui peut se résoudre avant la fin de init()
  document.documentElement.lang = S.langue;
  let pages;
  if (S.template === "sobre") {
    const { header, blocks } = renderSobre(CV, S);
    pages = paginerSobre(header, blocks, S.compactNiveau);
  } else {
    const { aside, header, blocks } = renderVisuel(CV, S);
    pages = paginerVisuel(aside, header, blocks, S.compactNiveau);
  }
  page.innerHTML = pages.join("");
  checkOverflow(pages.length);
}

function checkOverflow(nombrePages) {
  statut.textContent = nombrePages > 1 ? `${nombrePages} pages` : "Tient sur une page";
  statut.classList.toggle("over", nombrePages > 1);
  suggestionCompact.hidden = !(nombrePages > 1 && S.compactNiveau < 6) || lectureSeule;
}

function fit() {
  const avail = document.querySelector(".stage").clientWidth - 24;
  page.style.zoom = Math.min(1, avail / 794);
}

function reconstruirePanneau() {
  construirePanneau(panel, CV, S, onReglageChange, enregistrerAnnuaire);
}

// Mémorise automatiquement la sélection (ordre + cases cochées) du mode
// « libre » (pas de candidature ouverte), pour la retrouver telle quelle à la
// prochaine visite au lieu de repartir de la sélection par défaut. Sans objet
// pour une candidature (déjà sauvegardée via le bouton dédié) ou en lecture
// seule (rien à mémoriser).
let minuterieSauvegardeSelection = null;
function planifierSauvegardeSelection() {
  if (candidatureId || lectureSeule) return;
  clearTimeout(minuterieSauvegardeSelection);
  minuterieSauvegardeSelection = setTimeout(() => {
    api.enregistrerDerniereSelection(S).catch(() => {}); // best effort : pas grave si ça échoue
  }, 600);
}

// Sauvegarde immédiate (sans attendre le délai ci-dessus) quand on quitte la
// page, pour ne pas perdre le tout dernier changement.
function flushSauvegardeSelection() {
  if (candidatureId || lectureSeule || !S || !minuterieSauvegardeSelection) return;
  clearTimeout(minuterieSauvegardeSelection);
  fetch("/api/derniere-selection", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(S), keepalive: true
  }).catch(() => {});
}
window.addEventListener("pagehide", flushSauvegardeSelection);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushSauvegardeSelection();
});

function onReglageChange() {
  render();
  planifierSauvegardeSelection();
}

// Persiste l'annuaire (ajout/modification/suppression d'une puce) sur le
// serveur. CV est déjà à jour en mémoire (mutations en place), donc pas
// besoin de reconstruire le panneau ni de recharger l'annuaire ici.
async function enregistrerAnnuaire() {
  try {
    await api.enregistrerAnnuaire(CV);
  } catch (erreur) {
    alert("Impossible d’enregistrer l’annuaire : " + erreur.message);
  }
}

suggestionCompact.onclick = () => {
  S.compactNiveau = Math.min(6, S.compactNiveau + 1);
  onReglageChange();
  reconstruirePanneau();
};

window.addEventListener("resize", fit);
// Une fois les polices web chargées, les métriques de texte peuvent changer :
// on repagine (pas seulement checkOverflow) pour refléter la bonne mesure.
if (document.fonts) document.fonts.ready.then(render);

function ajouterBandeau(texte, { classe = "", boutonRetourVers = null } = {}) {
  const div = document.createElement("div");
  div.className = "bandeau" + (classe ? " " + classe : "");
  const span = document.createElement("span");
  span.textContent = texte;
  div.appendChild(span);
  if (boutonRetourVers) {
    const lien = document.createElement("a");
    lien.href = boutonRetourVers;
    lien.textContent = "← Retour à la candidature";
    div.appendChild(lien);
  }
  bandeauCandidature.appendChild(div);
  bandeauCandidature.hidden = false;
}

async function initLectureSeule() {
  const candidature = await api.candidature(candidatureId);
  if (!candidature.cv) {
    ajouterBandeau("Aucun CV enregistré pour cette candidature.", { classe: "bandeau-avertissement", boutonRetourVers: `candidature.html?id=${encodeURIComponent(candidatureId)}` });
    panel.hidden = true;
    return;
  }
  CV = candidature.cv.annuaire;
  S = JSON.parse(JSON.stringify(candidature.cv.selection));
  panel.hidden = true;
  ajouterBandeau(
    `CV envoyé le ${candidature.cv.dateEnregistrement} pour ${candidature.entreprise} — lecture seule.`,
    { boutonRetourVers: `candidature.html?id=${encodeURIComponent(candidatureId)}` }
  );
  render();
  fit();
}

async function initEdition() {
  CV = await api.cv();

  let candidature = null;
  if (candidatureId) {
    try { candidature = await api.candidature(candidatureId); }
    catch { candidature = null; }
  }

  let selectionBrute = null;
  let sourceCopiee = null;
  if (candidature && candidature.cv && !copierDeId) {
    selectionBrute = candidature.cv.selection;
  } else if (copierDeId) {
    try {
      const autre = await api.candidature(copierDeId);
      if (autre.cv) { selectionBrute = autre.cv.selection; sourceCopiee = autre.entreprise; }
    } catch { /* source introuvable : on ignore et repart de la sélection par défaut */ }
  } else if (!candidatureId) {
    // Mode « libre » (pas de candidature ouverte) : on reprend la dernière
    // sélection mémorisée automatiquement (voir planifierSauvegardeSelection),
    // pour retrouver l'écran tel qu'il a été laissé la dernière fois.
    try {
      const derniere = await api.derniereSelection();
      if (derniere) selectionBrute = derniere;
    } catch { /* pas grave : on repart de la sélection « tout coché » */ }
  }

  // Réconciliée dans tous les cas, y compris la sélection « tout coché » :
  // sur un annuaire différent de celui d'origine (candidature copiée), ses id
  // n'existent pas tous et doivent être filtrés silencieusement, comme
  // n'importe quelle sélection reprise — la différence est qu'on n'affiche le
  // bandeau "éléments retirés" que pour une vraie reprise (candidature/copierDe),
  // pas pour ce bootstrap dont l'utilisateur n'a jamais choisi le contenu.
  const { S: reconciliee, manquants } = reconcilierSelection(CV, selectionBrute || selectionToutSelectionnee(CV));
  S = reconciliee;
  if (manquants.length && selectionBrute) {
    ajouterBandeau(
      `Certains éléments de la sélection reprise n’existent plus dans l’annuaire et ont été retirés : ${manquants.join(", ")}.`,
      { classe: "bandeau-avertissement" }
    );
  }

  if (candidature) {
    const texte = sourceCopiee
      ? `Nouveau CV pour ${candidature.entreprise}, sélection reprise de ${sourceCopiee}.`
      : `CV pour ${candidature.entreprise}${candidature.poste ? " — " + candidature.poste : ""}.`;
    ajouterBandeau(texte, { boutonRetourVers: `candidature.html?id=${encodeURIComponent(candidatureId)}` });

    boutonEnregistrer.hidden = false;
    boutonEnregistrer.onclick = async () => {
      boutonEnregistrer.disabled = true;
      const texteInitial = boutonEnregistrer.textContent;
      boutonEnregistrer.textContent = "Enregistrement… (génération du PDF)";
      try {
        const misAJour = await api.enregistrerCV(candidatureId, { selection: S, annuaire: CV });
        boutonEnregistrer.textContent = misAJour.cv.pdfGenere ? "Enregistré ✓ (PDF généré)" : "Enregistré ✓ (PDF non généré, voir la fiche)";
        setTimeout(() => { boutonEnregistrer.textContent = texteInitial; }, 3000);
      } catch (erreur) {
        alert("Impossible d’enregistrer : " + erreur.message);
        boutonEnregistrer.textContent = texteInitial;
      } finally {
        boutonEnregistrer.disabled = false;
      }
    };
  }

  reconstruirePanneau();
  render();
  fit();
}

async function init() {
  try {
    if (candidatureId && lectureSeule) await initLectureSeule();
    else await initEdition();
  } catch (erreur) {
    ajouterBandeau("Erreur de chargement : " + erreur.message, { classe: "bandeau-avertissement" });
  }
}

init();
