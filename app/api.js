/* ============================================================
   Petits helpers fetch partagés par les vues ATS (ats.js, fiche.js)
   et l'éditeur de CV (app.js).
   ============================================================ */

async function requeteJSON(url, options) {
  const reponse = await fetch(url, options);
  if (!reponse.ok) {
    let message = `Erreur ${reponse.status}`;
    try {
      const corps = await reponse.json();
      if (corps && corps.erreur) message = corps.erreur;
    } catch {
      // corps non-JSON : on garde le message par défaut
    }
    throw new Error(message);
  }
  if (reponse.status === 204) return null;
  return reponse.json();
}

const enJSON = donnees => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(donnees) });

export const api = {
  cv: () => requeteJSON("/api/cv"),
  enregistrerAnnuaire: cv => requeteJSON("/api/cv", { method: "PUT", ...enJSON(cv) }),

  enregistrerPhoto: photo => requeteJSON("/api/photo", { method: "PUT", ...enJSON(photo) }),
  supprimerPhoto: () => requeteJSON("/api/photo", { method: "DELETE" }),

  statuts: () => requeteJSON("/api/statuts"),
  enregistrerStatuts: statuts => requeteJSON("/api/statuts", { method: "PUT", ...enJSON(statuts) }),

  candidatures: () => requeteJSON("/api/candidatures"),
  candidature: id => requeteJSON(`/api/candidatures/${encodeURIComponent(id)}`),
  creerCandidature: donnees => requeteJSON("/api/candidatures", { method: "POST", ...enJSON(donnees) }),
  modifierCandidature: (id, donnees) =>
    requeteJSON(`/api/candidatures/${encodeURIComponent(id)}`, { method: "PUT", ...enJSON(donnees) }),
  supprimerCandidature: id =>
    requeteJSON(`/api/candidatures/${encodeURIComponent(id)}`, { method: "DELETE" }),

  ajouterEvenement: (id, evenement) =>
    requeteJSON(`/api/candidatures/${encodeURIComponent(id)}/historique`, { method: "POST", ...enJSON(evenement) }),

  enregistrerCV: (id, donnees) =>
    requeteJSON(`/api/candidatures/${encodeURIComponent(id)}/cv`, { method: "PUT", ...enJSON(donnees) }),

  ajouterDocument: (id, document) =>
    requeteJSON(`/api/candidatures/${encodeURIComponent(id)}/documents`, { method: "POST", ...enJSON(document) }),
  supprimerDocument: (id, docId) =>
    requeteJSON(`/api/candidatures/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}`, { method: "DELETE" })
};

// Lit un fichier <input type="file"> et le renvoie en base64 (sans le préfixe data:...;base64,).
export function fichierEnBase64(fichier) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result).split(",", 2)[1] || "");
    lecteur.onerror = () => reject(lecteur.error);
    lecteur.readAsDataURL(fichier);
  });
}
