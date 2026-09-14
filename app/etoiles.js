/* ============================================================
   Petit sélecteur de note /10 à étoiles cliquables, partagé par
   le pop-up « Nouvelle candidature » (ats.js) et la fiche
   candidature (fiche.js). Cliquer sur l'étoile déjà sélectionnée
   remet la note à 0 (aucune note).
   ============================================================ */
export function creerEtoiles(valeurInitiale, max = 10) {
  const conteneur = document.createElement("div");
  conteneur.className = "etoiles";
  let valeur = valeurInitiale || 0;
  const boutons = [];

  function rafraichir() {
    boutons.forEach((b, i) => b.classList.toggle("pleine", i < valeur));
  }

  for (let i = 1; i <= max; i++) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "etoile";
    bouton.textContent = "★";
    bouton.title = `${i}/${max}`;
    bouton.onclick = () => {
      valeur = valeur === i ? 0 : i;
      rafraichir();
    };
    boutons.push(bouton);
    conteneur.appendChild(bouton);
  }
  rafraichir();

  return {
    element: conteneur,
    valeur: () => valeur,
    definir(v) { valeur = v || 0; rafraichir(); }
  };
}
