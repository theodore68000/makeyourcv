# CV modulable + suivi de candidatures

Un outil local pour construire des CV sur mesure et suivre ses candidatures.

L'idée : vous saisissez **une fois** tout votre parcours (formations, expériences, projets, compétences…), puis pour chaque offre vous cochez ce que vous voulez afficher et dans quel ordre. Le CV se met en page automatiquement, en français ou en anglais, selon deux modèles. En parallèle, vous suivez où vous en êtes dans chaque processus de recrutement.

Tout tourne sur votre ordinateur. Pas de compte, pas de serveur distant, pas de cloud.

## Ce que fait l'outil

**Deux modèles de CV.** Un modèle sobre sur une colonne, sans photo, en texte sélectionnable pour passer les logiciels de tri automatique (ATS). Un modèle visuel sur deux colonnes, avec photo et barre latérale colorée.

**Une seule source de contenu.** Vous corrigez une expérience à un seul endroit, elle est à jour partout.

**Français et anglais.** Chaque texte peut avoir sa traduction. Un bouton bascule tout le CV.

**Mise en page automatique.** Le contenu qui déborde passe sur une deuxième page sans jamais couper une expérience en deux. Un mode compact resserre le tout si vous voulez tenir sur une seule page.

**Suivi des candidatures.** Pour chaque offre : l'entreprise, le poste, le lien, vos notes, un statut que vous définissez vous-même, un historique daté des événements (entretien, relance, réponse) et les documents que vous avez envoyés. Une candidature peut exister avant même d'avoir un CV — vous repérez une offre, vous préparez le CV plus tard.

**Archivage fidèle.** Quand vous enregistrez un CV pour une candidature, une copie du contenu est figée. Même si vous réécrivez vos expériences six mois plus tard, vous pourrez toujours revoir exactement le CV que cette entreprise a reçu.

## Installation

Il faut **Python 3.9 ou plus récent**. Vérifiez avec `python --version` (ou `python3 --version`). Si la commande échoue, installez Python depuis [python.org](https://www.python.org/downloads/) — sur Windows, cochez « Add Python to PATH » pendant l'installation.

Téléchargez le projet, soit avec le bouton vert **Code → Download ZIP** (puis décompressez), soit en ligne de commande :

```bash
git clone https://github.com/theodore68000/makeyourcv.git
cd makeyourcv
python server.py
```

Ouvrez ensuite `http://localhost:7500` dans votre navigateur.

Au premier lancement, un CV de départ est créé pour vous, avec un exemple fictif par section pour montrer le format attendu. Allez dans l'éditeur, remplacez ces exemples par vos informations.

Pour arrêter le serveur, revenez au terminal et faites Ctrl+C.

## Où sont vos données

Tout est écrit dans des fichiers, à l'intérieur du dossier du projet :

| Quoi | Où |
|---|---|
| Votre parcours | `data/cv.json` |
| Votre photo | `data/photo.*` |
| Vos statuts de candidature | `data/statuts.json` |
| Vos candidatures | `candidatures/<identifiant>/` |

Chaque modification faite dans l'interface est enregistrée aussitôt. Vous pouvez fermer le navigateur et le terminal : à votre retour, tout est là.

Deux conséquences à connaître :

- **Sauvegarder, c'est copier le dossier du projet.** Mettez-le dans un dossier synchronisé si vous voulez le retrouver ailleurs. Il n'y a aucune sauvegarde automatique.
- **Rien ne quitte votre machine.** Si vous utilisez l'outil sur deux ordinateurs, les données ne se synchronisent pas toutes seules.

Ces fichiers sont exclus du dépôt Git. Si vous récupérez une mise à jour du code, vos données ne seront pas écrasées.

## Exporter en PDF

Le bouton **Imprimer en PDF** ouvre la boîte d'impression du navigateur. Choisissez « Enregistrer au format PDF », avec les marges sur **aucune** et les **graphiques d'arrière-plan activés** — sinon les couleurs du modèle visuel disparaissent.

Il existe aussi une génération automatique de PDF, qui archive le fichier directement dans le dossier de la candidature. Elle est **optionnelle** car elle télécharge un navigateur complet (plusieurs centaines de mégaoctets) :

```bash
pip install -r requirements.txt
playwright install chromium
```

Sans cette installation, tout le reste fonctionne normalement.

## Ce que l'outil n'est pas

- Il n'y a **ni compte, ni mot de passe, ni chiffrement**. Le serveur n'écoute que votre propre machine (`127.0.0.1`), il n'est pas accessible depuis votre réseau local. Mais toute personne ayant accès à votre session a accès à vos données.
- Ce n'est **pas un service en ligne**. Il faut lancer le serveur pour l'utiliser.
- Il n'y a **pas de synchronisation** entre appareils.
- Ce n'est **pas un générateur de contenu**. L'outil met en forme ce que vous écrivez, il n'invente rien à votre place.

## Problèmes courants

**« python : commande introuvable »** — essayez `python3 server.py`, ou réinstallez Python en ajoutant bien la case PATH.

**« Address already in use »** — un autre programme occupe le port. Le serveur essaie automatiquement les ports suivants ; regardez l'adresse affichée dans le terminal.

**Les couleurs manquent dans le PDF** — activez les graphiques d'arrière-plan dans les options d'impression.

**Le CV déborde sur une deuxième page** — activez le mode compact, ou décochez quelques puces. C'est justement le but : vous choisissez quoi enlever.

## Sous le capot

Serveur en Python, bibliothèque standard uniquement. Front en HTML, CSS et JavaScript sans framework ni étape de compilation. La seule dépendance externe, Playwright, ne sert qu'à la génération automatique de PDF et reste facultative.

## Licence

MIT. Vous pouvez l'utiliser, le modifier et le redistribuer librement.
