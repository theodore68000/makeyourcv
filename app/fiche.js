/* ============================================================
   Fiche candidature : infos générales, statut, historique daté,
   documents joints, et bloc CV (création / consultation / modif.
   via l'éditeur, avec possibilité de repartir de la sélection
   d'une autre candidature).
   ============================================================ */
import { api, fichierEnBase64 } from "./api.js";
import { creerEtoiles } from "./etoiles.js";

const id = new URLSearchParams(window.location.search).get("id");

const messageErreur = document.getElementById("message-erreur");
const contenuFiche = document.getElementById("contenu-fiche");

function afficherErreur(erreur) {
  messageErreur.textContent = erreur.message || String(erreur);
  messageErreur.hidden = false;
}

function formaterDate(iso) {
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

if (!id) {
  afficherErreur(new Error("Aucune candidature indiquée."));
} else {
  init();
}

async function init() {
  let candidature, statuts, autresCandidatures;
  try {
    [candidature, statuts, autresCandidatures] = await Promise.all([
      api.candidature(id), api.statuts(), api.candidatures()
    ]);
  } catch (erreur) {
    afficherErreur(erreur);
    return;
  }

  contenuFiche.hidden = false;
  document.title = `${candidature.entreprise} – Candidature`;

  renduEntete(candidature, statuts);
  renduInfos(candidature);
  renduHistorique(candidature);
  renduDocuments(candidature);
  renduCV(candidature, autresCandidatures.filter(c => c.id !== id && c.aCV));
}

function renduEntete(candidature, statuts) {
  document.getElementById("titre-entreprise").textContent = candidature.entreprise;
  document.getElementById("sous-titre-poste").textContent = candidature.poste || "Poste non précisé";

  const selecteur = document.getElementById("selecteur-statut");
  selecteur.innerHTML = "";
  selecteur.appendChild(new Option("Sans statut", ""));
  for (const s of statuts) selecteur.appendChild(new Option(s.nom, s.id));
  selecteur.value = candidature.statutId || "";
  selecteur.onchange = async () => {
    try {
      await api.modifierCandidature(id, { statutId: selecteur.value || null });
    } catch (erreur) {
      afficherErreur(erreur);
    }
  };

  document.getElementById("bouton-supprimer").onclick = async () => {
    if (!confirm(`Supprimer la candidature « ${candidature.entreprise} » ? Cette action est irréversible.`)) return;
    try {
      await api.supprimerCandidature(id);
      window.location.href = "index.html";
    } catch (erreur) {
      afficherErreur(erreur);
    }
  };
}

function renduInfos(candidature) {
  const formulaire = document.getElementById("formulaire-infos");
  formulaire.entreprise.value = candidature.entreprise || "";
  formulaire.poste.value = candidature.poste || "";
  formulaire.lienOffre.value = candidature.lienOffre || "";
  formulaire.contacts.value = candidature.contacts || "";
  formulaire.notes.value = candidature.notes || "";

  const etoiles = creerEtoiles(candidature.note || 0);
  const conteneurEtoiles = document.getElementById("etoiles-infos");
  conteneurEtoiles.innerHTML = "";
  conteneurEtoiles.appendChild(etoiles.element);

  formulaire.onsubmit = async evt => {
    evt.preventDefault();
    const donnees = Object.fromEntries(new FormData(formulaire));
    donnees.note = etoiles.valeur();
    try {
      const misAJour = await api.modifierCandidature(id, donnees);
      document.getElementById("titre-entreprise").textContent = misAJour.entreprise;
      document.getElementById("sous-titre-poste").textContent = misAJour.poste || "Poste non précisé";
    } catch (erreur) {
      afficherErreur(erreur);
    }
  };
}

function renduHistorique(candidature) {
  const liste = document.getElementById("liste-historique");
  liste.innerHTML = "";
  const evenements = [...candidature.historique].reverse();
  if (!evenements.length) {
    const li = document.createElement("li");
    li.className = "liste-vide";
    li.textContent = "Aucun évènement pour l’instant.";
    liste.appendChild(li);
  }
  for (const ev of evenements) {
    const li = document.createElement("li");
    const date = document.createElement("span");
    date.className = "date-evenement";
    date.textContent = formaterDate(ev.date);
    const texte = document.createElement("span");
    texte.textContent = ev.texte;
    li.append(date, texte);
    liste.appendChild(li);
  }

  const formulaire = document.getElementById("formulaire-evenement");
  formulaire.onsubmit = async evt => {
    evt.preventDefault();
    const donnees = Object.fromEntries(new FormData(formulaire));
    if (!donnees.date) delete donnees.date;
    try {
      const misAJour = await api.ajouterEvenement(id, donnees);
      candidature.historique = misAJour.historique;
      formulaire.reset();
      renduHistorique(candidature);
    } catch (erreur) {
      afficherErreur(erreur);
    }
  };
}

function renduDocuments(candidature) {
  const liste = document.getElementById("liste-documents");
  liste.innerHTML = "";
  if (!candidature.documents.length) {
    const li = document.createElement("li");
    li.className = "liste-vide";
    li.textContent = "Aucun document joint.";
    liste.appendChild(li);
  }
  for (const doc of candidature.documents) {
    const li = document.createElement("li");
    const lien = document.createElement("a");
    lien.href = `/candidature-fichiers/${encodeURIComponent(id)}/${encodeURIComponent(doc.nomStocke)}`;
    lien.target = "_blank";
    lien.textContent = doc.nomOriginal;
    li.appendChild(lien);
    const date = document.createElement("span");
    date.className = "date-document";
    date.textContent = formaterDate(doc.dateAjout);
    li.appendChild(date);
    const boutonSupprimer = document.createElement("button");
    boutonSupprimer.type = "button";
    boutonSupprimer.className = "danger discret";
    boutonSupprimer.textContent = "Supprimer";
    boutonSupprimer.onclick = async () => {
      try {
        const misAJour = await api.supprimerDocument(id, doc.id);
        candidature.documents = misAJour.documents;
        renduDocuments(candidature);
      } catch (erreur) {
        afficherErreur(erreur);
      }
    };
    li.appendChild(boutonSupprimer);
    liste.appendChild(li);
  }

  const entreeFichier = document.getElementById("entree-fichier");
  entreeFichier.onchange = async () => {
    const fichier = entreeFichier.files[0];
    if (!fichier) return;
    if (fichier.size > 20 * 1024 * 1024) {
      afficherErreur(new Error("Fichier trop volumineux (max 20 Mo)."));
      entreeFichier.value = "";
      return;
    }
    try {
      const contenuBase64 = await fichierEnBase64(fichier);
      const document_ = await api.ajouterDocument(id, {
        nomOriginal: fichier.name, type: fichier.type, contenuBase64
      });
      candidature.documents.push(document_);
      renduDocuments(candidature);
    } catch (erreur) {
      afficherErreur(erreur);
    } finally {
      entreeFichier.value = "";
    }
  };
}

function renduCV(candidature, candidaturesAvecCV) {
  const conteneur = document.getElementById("etat-cv");
  conteneur.innerHTML = "";

  if (candidature.cv) {
    const p = document.createElement("p");
    p.textContent = `CV enregistré le ${formaterDate(candidature.cv.dateEnregistrement)}.`;
    conteneur.appendChild(p);

    if (!candidature.cv.pdfGenere) {
      const avertissement = document.createElement("p");
      avertissement.className = "cv-pdf-erreur";
      avertissement.textContent = "PDF non généré : " + (candidature.cv.pdfErreur || "erreur inconnue");
      conteneur.appendChild(avertissement);
    }

    const actions = document.createElement("div");
    actions.className = "cv-actions";
    const voir = document.createElement("a");
    voir.className = "bouton-lien";
    voir.href = `editeur.html?candidature=${encodeURIComponent(id)}&lecture=seule`;
    voir.textContent = "Voir le CV envoyé";
    const modifier = document.createElement("a");
    modifier.className = "bouton-lien principal";
    modifier.href = `editeur.html?candidature=${encodeURIComponent(id)}`;
    modifier.textContent = "Modifier le CV";
    actions.append(voir, modifier);

    if (candidature.cv.pdfGenere) {
      const pdf = document.createElement("a");
      pdf.className = "bouton-lien";
      pdf.href = `/api/candidatures/${encodeURIComponent(id)}/cv.pdf`;
      pdf.target = "_blank";
      pdf.textContent = "Télécharger le PDF";
      actions.appendChild(pdf);
    } else {
      const reessayer = document.createElement("button");
      reessayer.type = "button";
      reessayer.textContent = "Réessayer de générer le PDF";
      reessayer.onclick = async () => {
        reessayer.disabled = true;
        reessayer.textContent = "Génération…";
        try {
          const misAJour = await api.enregistrerCV(id, {
            selection: candidature.cv.selection, annuaire: candidature.cv.annuaire
          });
          candidature.cv = misAJour.cv;
          renduCV(candidature, candidaturesAvecCV);
        } catch (erreur) {
          afficherErreur(erreur);
          reessayer.disabled = false;
          reessayer.textContent = "Réessayer de générer le PDF";
        }
      };
      actions.appendChild(reessayer);
    }

    conteneur.appendChild(actions);
    return;
  }

  const p = document.createElement("p");
  p.textContent = "Aucun CV pour cette candidature pour l’instant.";
  conteneur.appendChild(p);

  const actions = document.createElement("div");
  actions.className = "cv-actions";
  const creer = document.createElement("a");
  creer.className = "bouton-lien principal";
  creer.href = `editeur.html?candidature=${encodeURIComponent(id)}`;
  creer.textContent = "Créer le CV";
  actions.appendChild(creer);

  if (candidaturesAvecCV.length) {
    const selecteur = document.createElement("select");
    selecteur.appendChild(new Option("Copier la sélection d’une autre candidature…", ""));
    for (const c of candidaturesAvecCV) selecteur.appendChild(new Option(`${c.entreprise}${c.poste ? " — " + c.poste : ""}`, c.id));
    const boutonCopier = document.createElement("a");
    boutonCopier.className = "bouton-lien";
    boutonCopier.textContent = "Utiliser cette sélection";
    boutonCopier.href = "#";
    boutonCopier.onclick = evt => {
      evt.preventDefault();
      if (!selecteur.value) return;
      window.location.href = `editeur.html?candidature=${encodeURIComponent(id)}&copierDe=${encodeURIComponent(selecteur.value)}`;
    };
    actions.append(selecteur, boutonCopier);
  }

  conteneur.appendChild(actions);
}
