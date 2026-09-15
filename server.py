"""Petit serveur local pour l'application CV modulable + suivi de candidatures (ATS).

Sert les fichiers de app/ à la racine, l'annuaire (data/cv.json), les statuts
personnalisés (data/statuts.json), et une API JSON pour gérer les candidatures
(chacune dans son propre dossier sous candidatures/, avec ses documents joints).

Aucune dépendance externe : uniquement la bibliothèque standard. Les fichiers
joints sont envoyés en JSON (base64) plutôt qu'en multipart/form-data, pour ne
pas dépendre du module cgi (retiré de la bibliothèque standard en Python 3.13).
"""
import base64
import json
import mimetypes
import re
import shutil
import unicodedata
import uuid
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RACINE = Path(__file__).resolve().parent
DOSSIER_APP = RACINE / "app"
DOSSIER_DATA = RACINE / "data"
DOSSIER_CANDIDATURES = RACINE / "candidatures"
FICHIER_CV = DOSSIER_DATA / "cv.json"
FICHIER_STATUTS = DOSSIER_DATA / "statuts.json"
FICHIER_DERNIERE_SELECTION = DOSSIER_DATA / "derniere-selection.json"
FICHIER_CV_EXEMPLE = DOSSIER_DATA / "cv.exemple.json"
FICHIER_STATUTS_EXEMPLE = DOSSIER_DATA / "statuts.exemple.json"
FICHIER_PHOTO_EXEMPLE = DOSSIER_DATA / "PhotoExemple.png"
PORT_PAR_DEFAUT = 8000
NB_PORTS_ESSAYES = 20
PORT = None  # défini au démarrage par demarrer_serveur(), une fois le port réellement choisi
TAILLE_MAX_DOCUMENT = 20 * 1024 * 1024  # 20 Mo
TAILLE_MAX_PHOTO = 2 * 1024 * 1024  # 2 Mo
EXTENSIONS_PHOTO_AUTORISEES = {"jpg", "jpeg", "png", "webp"}

# mimetypes connaît déjà jpg/jpeg/png/webp sur les installations Python
# récentes, mais on le force ici pour ne pas dépendre de la version du
# système qui exécute le serveur (GET /data/* doit renvoyer le bon type).
for _extension, _type in (("jpg", "image/jpeg"), ("jpeg", "image/jpeg"), ("png", "image/png"), ("webp", "image/webp")):
    mimetypes.add_type(_type, f".{_extension}")


def aujourd_hui():
    return date.today().isoformat()


def id_valide(id_):
    return bool(re.fullmatch(r"[A-Za-z0-9_-]+", id_ or ""))


def note_valide(valeur):
    try:
        return max(0, min(10, int(valeur)))
    except (TypeError, ValueError):
        return 0


def slugifier(texte):
    sans_accents = unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", sans_accents).strip("-").lower()
    return slug or "candidature"


def chemin_candidature(id_):
    return DOSSIER_CANDIDATURES / id_


def nouvel_id_candidature(entreprise):
    base = f"{aujourd_hui()}_{slugifier(entreprise)}"
    id_, n = base, 2
    while chemin_candidature(id_).exists():
        id_ = f"{base}-{n}"
        n += 1
    return id_


def lire_cv():
    return json.loads(FICHIER_CV.read_text(encoding="utf-8"))


def ecrire_cv(valeur):
    DOSSIER_DATA.mkdir(parents=True, exist_ok=True)
    FICHIER_CV.write_text(json.dumps(valeur, ensure_ascii=False, indent=2), encoding="utf-8")


def supprimer_anciennes_photos():
    """Retire tous les fichiers data/photo.<ext> existants, quelle que soit
    leur extension — utilisé avant d'écrire une nouvelle photo ou de la
    retirer, pour ne jamais laisser deux fichiers en même temps."""
    for extension in EXTENSIONS_PHOTO_AUTORISEES:
        fichier = DOSSIER_DATA / f"photo.{extension}"
        if fichier.is_file():
            fichier.unlink()


def lire_candidature(id_):
    if not id_valide(id_):
        return None
    fichier = chemin_candidature(id_) / "candidature.json"
    if not fichier.is_file():
        return None
    return json.loads(fichier.read_text(encoding="utf-8"))


def ecrire_candidature(id_, valeur):
    dossier = chemin_candidature(id_)
    dossier.mkdir(parents=True, exist_ok=True)
    (dossier / "candidature.json").write_text(
        json.dumps(valeur, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def lister_candidatures():
    resultats = []
    if DOSSIER_CANDIDATURES.is_dir():
        for dossier in DOSSIER_CANDIDATURES.iterdir():
            fichier = dossier / "candidature.json"
            if not fichier.is_file():
                continue
            try:
                c = json.loads(fichier.read_text(encoding="utf-8"))
                derniere = c["dateCreation"]
                if c.get("historique"):
                    derniere = max(derniere, c["historique"][-1]["date"])
                resultats.append({
                    "id": c["id"], "entreprise": c["entreprise"], "poste": c.get("poste", ""),
                    "statutId": c.get("statutId"), "dateCreation": c["dateCreation"],
                    "note": c.get("note", 0),
                    "derniereActivite": derniere, "aCV": c.get("cv") is not None
                })
            except (json.JSONDecodeError, KeyError, UnicodeDecodeError) as exc:
                # Un fichier corrompu ou incomplet ne doit pas faire échouer
                # toute la liste : on l'ignore et on le signale sur la sortie
                # standard (utile pour la personne qui a lancé le serveur).
                print(f"Avertissement : candidature illisible ignorée ({fichier}) : {exc}")
    resultats.sort(key=lambda x: x["derniereActivite"], reverse=True)
    return resultats


def lire_statuts():
    if not FICHIER_STATUTS.is_file():
        return []
    return json.loads(FICHIER_STATUTS.read_text(encoding="utf-8"))


def ecrire_statuts(valeur):
    DOSSIER_DATA.mkdir(parents=True, exist_ok=True)
    FICHIER_STATUTS.write_text(json.dumps(valeur, ensure_ascii=False, indent=2), encoding="utf-8")


def lire_derniere_selection():
    """La sélection (ordre + cases cochées) utilisée en dehors de toute
    candidature, mémorisée automatiquement pour la retrouver telle quelle à
    la prochaine visite — None si l'utilisateur n'a encore rien personnalisé."""
    if not FICHIER_DERNIERE_SELECTION.is_file():
        return None
    return json.loads(FICHIER_DERNIERE_SELECTION.read_text(encoding="utf-8"))


def ecrire_derniere_selection(valeur):
    DOSSIER_DATA.mkdir(parents=True, exist_ok=True)
    FICHIER_DERNIERE_SELECTION.write_text(json.dumps(valeur, ensure_ascii=False, indent=2), encoding="utf-8")


def generer_pdf_candidature(id_):
    """Génère le PDF exact du CV enregistré pour cette candidature (via un
    Chromium headless piloté par Playwright), et l'enregistre dans le dossier
    de la candidature. Retourne (succes: bool, erreur: str | None)."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return False, ("Playwright n'est pas installé. Lance : pip install -r requirements.txt "
                        "puis playwright install chromium")

    url = f"http://127.0.0.1:{PORT}/editeur.html?candidature={id_}&lecture=seule"
    chemin_pdf = chemin_candidature(id_) / "cv.pdf"
    try:
        with sync_playwright() as p:
            navigateur = p.chromium.launch()
            page = navigateur.new_page()
            page.goto(url, wait_until="networkidle")
            page.pdf(
                path=str(chemin_pdf), format="A4", print_background=True,
                margin={"top": "0", "bottom": "0", "left": "0", "right": "0"}
            )
            navigateur.close()
        return True, None
    except Exception as exc:
        return False, str(exc)


class CorpsInvalide(Exception):
    pass


class Serveur(ThreadingHTTPServer):
    # HTTPServer active allow_reuse_address par défaut. Sur Windows, ça permet
    # à deux processus de se lier silencieusement au même port en même temps
    # (contrairement à Linux, où SO_REUSEADDR ne fait qu'accélérer la reprise
    # après TIME_WAIT) : les requêtes finissent alors réparties de façon
    # imprévisible entre les deux, sans aucune erreur visible. On le désactive
    # pour qu'un port déjà occupé lève bien une erreur — condition nécessaire
    # au repli sur le port suivant, cf. demarrer_serveur().
    allow_reuse_address = False


class Handler(BaseHTTPRequestHandler):
    # ---------- Utilitaires de réponse ----------
    def envoyer_json(self, valeur, code=200):
        corps = json.dumps(valeur, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def envoyer_erreur_json(self, code, message):
        self.envoyer_json({"erreur": message}, code)

    def envoyer_fichier(self, chemin: Path, type_mime: "str | None" = None):
        try:
            chemin = chemin.resolve()
            chemin.relative_to(RACINE)  # empêche de sortir du dossier du projet
            contenu = chemin.read_bytes()
        except (FileNotFoundError, ValueError, OSError):
            self.send_error(404, "Fichier introuvable")
            return
        if type_mime is None:
            type_mime, _ = mimetypes.guess_type(str(chemin))
            type_mime = type_mime or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", type_mime)
        self.send_header("Content-Length", str(len(contenu)))
        self.end_headers()
        self.wfile.write(contenu)

    def lire_corps_json(self):
        longueur = int(self.headers.get("Content-Length", 0) or 0)
        corps = self.rfile.read(longueur) if longueur else b"{}"
        try:
            return json.loads(corps.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise CorpsInvalide(str(exc)) from exc

    def log_message(self, format, *args):
        pass  # journal silencieux pour un usage local

    # ---------- GET ----------
    def do_GET(self):
        chemin = self.path.split("?", 1)[0]
        if chemin == "/":
            chemin = "/index.html"

        m = re.fullmatch(r"/candidature-fichiers/([^/]+)/([^/]+)", chemin)
        if m:
            id_, nom_fichier = m.groups()
            if not id_valide(id_):
                self.envoyer_erreur_json(404, "Candidature introuvable")
                return
            self.envoyer_fichier(chemin_candidature(id_) / "documents" / nom_fichier)
            return

        m = re.fullmatch(r"/api/candidatures/([^/]+)/cv\.pdf", chemin)
        if m:
            id_ = m.group(1)
            if not id_valide(id_):
                self.envoyer_erreur_json(404, "Candidature introuvable")
                return
            self.envoyer_fichier(chemin_candidature(id_) / "cv.pdf", "application/pdf")
            return

        if chemin == "/api/cv":
            self.envoyer_fichier(FICHIER_CV, "application/json; charset=utf-8")
            return
        if chemin == "/api/statuts":
            self.envoyer_json(lire_statuts())
            return
        if chemin == "/api/derniere-selection":
            self.envoyer_json(lire_derniere_selection())
            return
        if chemin == "/api/candidatures":
            self.envoyer_json(lister_candidatures())
            return
        m = re.fullmatch(r"/api/candidatures/([^/]+)", chemin)
        if m:
            candidature = lire_candidature(m.group(1))
            if candidature is None:
                self.envoyer_erreur_json(404, "Candidature introuvable")
            else:
                self.envoyer_json(candidature)
            return

        if chemin.startswith("/data/"):
            self.envoyer_fichier(RACINE / chemin.lstrip("/"))
            return
        self.envoyer_fichier(DOSSIER_APP / chemin.lstrip("/"))

    # ---------- POST ----------
    def do_POST(self):
        try:
            self._do_POST()
        except CorpsInvalide:
            self.envoyer_erreur_json(400, "Corps de requête JSON invalide")

    def _do_POST(self):
        chemin = self.path.split("?", 1)[0]

        if chemin == "/api/candidatures":
            corps = self.lire_corps_json()
            entreprise = (corps.get("entreprise") or "").strip()
            if not entreprise:
                self.envoyer_erreur_json(400, "Le nom de l'entreprise est obligatoire")
                return
            aujourdhui = aujourd_hui()
            id_ = nouvel_id_candidature(entreprise)
            candidature = {
                "id": id_, "entreprise": entreprise, "poste": (corps.get("poste") or "").strip(),
                "lienOffre": (corps.get("lienOffre") or "").strip(), "notes": (corps.get("notes") or "").strip(),
                "contacts": (corps.get("contacts") or "").strip(), "note": note_valide(corps.get("note")),
                "dateCreation": aujourdhui, "statutId": None,
                "historique": [{"date": aujourdhui, "texte": "Candidature créée"}],
                "documents": [], "cv": None
            }
            ecrire_candidature(id_, candidature)
            self.envoyer_json(candidature, 201)
            return

        m = re.fullmatch(r"/api/candidatures/([^/]+)/historique", chemin)
        if m:
            id_ = m.group(1)
            candidature = lire_candidature(id_)
            if candidature is None:
                self.envoyer_erreur_json(404, "Candidature introuvable")
                return
            corps = self.lire_corps_json()
            texte = (corps.get("texte") or "").strip()
            if not texte:
                self.envoyer_erreur_json(400, "Le texte de l'évènement est obligatoire")
                return
            candidature["historique"].append({"date": corps.get("date") or aujourd_hui(), "texte": texte})
            ecrire_candidature(id_, candidature)
            self.envoyer_json(candidature, 201)
            return

        m = re.fullmatch(r"/api/candidatures/([^/]+)/documents", chemin)
        if m:
            id_ = m.group(1)
            candidature = lire_candidature(id_)
            if candidature is None:
                self.envoyer_erreur_json(404, "Candidature introuvable")
                return
            longueur = int(self.headers.get("Content-Length", 0) or 0)
            if longueur > TAILLE_MAX_DOCUMENT * 4 // 3 + 1024:  # marge pour le gonflement du base64
                self.envoyer_erreur_json(413, "Fichier trop volumineux (max 20 Mo)")
                return
            corps = self.lire_corps_json()
            nom_original = (corps.get("nomOriginal") or "document").strip()
            try:
                contenu = base64.b64decode(corps.get("contenuBase64") or "", validate=True)
            except Exception:
                self.envoyer_erreur_json(400, "Fichier invalide")
                return
            doc_id = uuid.uuid4().hex[:8]
            suffixe = Path(nom_original).suffix
            # Nom tronqué : un nom de fichier d'origine très long, combiné au
            # dossier de la candidature, peut sinon dépasser la longueur de
            # chemin maximale de Windows et faire échouer l'écriture.
            nom_stocke = f"{doc_id}_{slugifier(Path(nom_original).stem)[:60]}{suffixe}"
            dossier_docs = chemin_candidature(id_) / "documents"
            dossier_docs.mkdir(parents=True, exist_ok=True)
            (dossier_docs / nom_stocke).write_bytes(contenu)
            entree = {
                "id": doc_id, "nomOriginal": nom_original, "nomStocke": nom_stocke,
                "type": corps.get("type") or "application/octet-stream", "dateAjout": aujourd_hui()
            }
            candidature["documents"].append(entree)
            ecrire_candidature(id_, candidature)
            self.envoyer_json(entree, 201)
            return

        self.envoyer_erreur_json(404, "Route inconnue")

    # ---------- PUT ----------
    def do_PUT(self):
        try:
            self._do_PUT()
        except CorpsInvalide:
            self.envoyer_erreur_json(400, "Corps de requête JSON invalide")

    def _do_PUT(self):
        chemin = self.path.split("?", 1)[0]

        if chemin == "/api/statuts":
            corps = self.lire_corps_json()
            if not isinstance(corps, list):
                self.envoyer_erreur_json(400, "Liste de statuts attendue")
                return
            ecrire_statuts(corps)
            self.envoyer_json(corps)
            return

        if chemin == "/api/cv":
            corps = self.lire_corps_json()
            if not isinstance(corps, dict):
                self.envoyer_erreur_json(400, "Annuaire invalide")
                return
            ecrire_cv(corps)
            self.envoyer_json(corps)
            return

        if chemin == "/api/derniere-selection":
            corps = self.lire_corps_json()
            if not isinstance(corps, dict):
                self.envoyer_erreur_json(400, "Sélection invalide")
                return
            ecrire_derniere_selection(corps)
            self.envoyer_json(corps)
            return

        if chemin == "/api/photo":
            longueur = int(self.headers.get("Content-Length", 0) or 0)
            if longueur > TAILLE_MAX_PHOTO * 4 // 3 + 1024:  # marge pour le gonflement du base64
                self.envoyer_erreur_json(413, "Image trop volumineuse (max 2 Mo)")
                return
            corps = self.lire_corps_json()
            nom_original = (corps.get("nomOriginal") or "").strip()
            extension = Path(nom_original).suffix.lstrip(".").lower()
            if extension not in EXTENSIONS_PHOTO_AUTORISEES:
                self.envoyer_erreur_json(400, "Format d'image non supporté (jpg, jpeg, png ou webp uniquement)")
                return
            try:
                contenu = base64.b64decode(corps.get("contenuBase64") or "", validate=True)
            except Exception:
                self.envoyer_erreur_json(400, "Fichier invalide")
                return
            if len(contenu) > TAILLE_MAX_PHOTO:
                self.envoyer_erreur_json(413, "Image trop volumineuse (max 2 Mo)")
                return
            DOSSIER_DATA.mkdir(parents=True, exist_ok=True)
            supprimer_anciennes_photos()
            chemin_relatif = f"data/photo.{extension}"
            (RACINE / chemin_relatif).write_bytes(contenu)
            cv = lire_cv()
            cv["identite"]["photo"] = chemin_relatif
            ecrire_cv(cv)
            self.envoyer_json({"photo": chemin_relatif})
            return

        m = re.fullmatch(r"/api/candidatures/([^/]+)/cv", chemin)
        if m:
            id_ = m.group(1)
            candidature = lire_candidature(id_)
            if candidature is None:
                self.envoyer_erreur_json(404, "Candidature introuvable")
                return
            corps = self.lire_corps_json()
            candidature["cv"] = {
                "selection": corps.get("selection"),
                "annuaire": corps.get("annuaire"),
                "dateEnregistrement": aujourd_hui()
            }
            ecrire_candidature(id_, candidature)
            succes, erreur = generer_pdf_candidature(id_)
            candidature["cv"]["pdfGenere"] = succes
            candidature["cv"]["pdfErreur"] = erreur
            ecrire_candidature(id_, candidature)
            self.envoyer_json(candidature)
            return

        m = re.fullmatch(r"/api/candidatures/([^/]+)", chemin)
        if m:
            id_ = m.group(1)
            candidature = lire_candidature(id_)
            if candidature is None:
                self.envoyer_erreur_json(404, "Candidature introuvable")
                return
            corps = self.lire_corps_json()
            for cle in ("entreprise", "poste", "lienOffre", "notes", "contacts", "statutId"):
                if cle in corps:
                    candidature[cle] = corps[cle]
            if "note" in corps:
                candidature["note"] = note_valide(corps["note"])
            ecrire_candidature(id_, candidature)
            self.envoyer_json(candidature)
            return

        self.envoyer_erreur_json(404, "Route inconnue")

    # ---------- DELETE ----------
    def do_DELETE(self):
        chemin = self.path.split("?", 1)[0]

        if chemin == "/api/photo":
            supprimer_anciennes_photos()
            cv = lire_cv()
            cv["identite"]["photo"] = ""
            ecrire_cv(cv)
            self.envoyer_json({"photo": ""})
            return

        m = re.fullmatch(r"/api/candidatures/([^/]+)/documents/([^/]+)", chemin)
        if m:
            id_, doc_id = m.groups()
            candidature = lire_candidature(id_)
            if candidature is None:
                self.envoyer_erreur_json(404, "Candidature introuvable")
                return
            doc = next((d for d in candidature["documents"] if d["id"] == doc_id), None)
            if doc is None:
                self.envoyer_erreur_json(404, "Document introuvable")
                return
            fichier = chemin_candidature(id_) / "documents" / doc["nomStocke"]
            if fichier.is_file():
                fichier.unlink()
            candidature["documents"] = [d for d in candidature["documents"] if d["id"] != doc_id]
            ecrire_candidature(id_, candidature)
            self.envoyer_json(candidature)
            return

        m = re.fullmatch(r"/api/candidatures/([^/]+)", chemin)
        if m:
            id_ = m.group(1)
            if not id_valide(id_) or not chemin_candidature(id_).is_dir():
                self.envoyer_erreur_json(404, "Candidature introuvable")
                return
            shutil.rmtree(chemin_candidature(id_))
            self.envoyer_json({"ok": True})
            return

        self.envoyer_erreur_json(404, "Route inconnue")


def preparer_dossiers():
    """Sur un tout premier lancement (dépôt fraîchement cloné, sans data/cv.json
    ni candidatures/ puisqu'ils sont ignorés par Git), copie les fichiers
    d'exemple vers leur nom réel — sans jamais écraser un fichier déjà
    existant — et crée candidatures/."""
    DOSSIER_DATA.mkdir(parents=True, exist_ok=True)
    if not FICHIER_CV.exists() and FICHIER_CV_EXEMPLE.exists():
        shutil.copyfile(FICHIER_CV_EXEMPLE, FICHIER_CV)
        print(f"Première utilisation : {FICHIER_CV_EXEMPLE.name} copié vers {FICHIER_CV.name}")
    if not FICHIER_STATUTS.exists() and FICHIER_STATUTS_EXEMPLE.exists():
        shutil.copyfile(FICHIER_STATUTS_EXEMPLE, FICHIER_STATUTS)
    photo_deja_presente = any((DOSSIER_DATA / f"photo.{ext}").exists() for ext in EXTENSIONS_PHOTO_AUTORISEES)
    if not photo_deja_presente and FICHIER_PHOTO_EXEMPLE.exists():
        shutil.copyfile(FICHIER_PHOTO_EXEMPLE, DOSSIER_DATA / "photo.png")
    DOSSIER_CANDIDATURES.mkdir(parents=True, exist_ok=True)


def demarrer_serveur():
    global PORT
    preparer_dossiers()
    # Écoute uniquement sur 127.0.0.1 (jamais 0.0.0.0) : l'API d'écriture
    # (/api/cv, /api/candidatures, ...) n'a aucune authentification, donc
    # l'exposer au-delà de la machine locale permettrait à n'importe qui sur
    # le même réseau de lire les candidatures ou réécrire l'annuaire. C'est
    # un choix délibéré, adapté à un usage strictement local.
    for essai in range(NB_PORTS_ESSAYES):
        port = PORT_PAR_DEFAUT + essai
        try:
            httpd = Serveur(("127.0.0.1", port), Handler)
        except OSError:
            continue  # port déjà occupé : on essaie le suivant
        PORT = port
        with httpd:
            print(f"Serveur démarré : http://localhost:{port}")
            if port != PORT_PAR_DEFAUT:
                print(f"(le port {PORT_PAR_DEFAUT} était occupé, {port} utilisé à la place)")
            print("Ctrl+C pour arrêter le serveur.")
            httpd.serve_forever()
        return
    raise SystemExit(
        f"Impossible de démarrer : les ports {PORT_PAR_DEFAUT} à {PORT_PAR_DEFAUT + NB_PORTS_ESSAYES - 1} "
        "sont tous occupés."
    )


if __name__ == "__main__":
    demarrer_serveur()
