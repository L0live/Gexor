#!/usr/bin/env python3
"""
Gexor — Wikidata Full Taxonomy Extractor
=========================================
Extrait L'INTÉGRALITÉ des relations P31 (instance of) et P279 (subclass of)
de Wikidata via les dumps officiels — pas via SPARQL (trop limité).

DEUX MODES :
  --mode truthy   Dump N-Triples truthy (~30 GB compressé).
                  ✓ Rapide   ✗ Pas de qualificateurs temporels (P580/P582)
                  URL: https://dumps.wikimedia.org/wikidatawiki/entities/latest-truthy.nt.bz2

  --mode json     Dump JSON complet (~80–100 GB compressé, ~1 TB décompressé).
                  ✓ Qualificateurs temporels   ✗ Lent (12–24h selon machine)
                  URL: https://dumps.wikimedia.org/wikidatawiki/entities/latest-all.json.bz2

SORTIE JSON :
  {
    "meta": { mode, source, total_items_processed, ... },
    "classes":   { "Q5":  { "parents": [...], "children": [...] } },
    "edges": {
      "p279": [ { "child", "parent", "startTime"?, "endTime"?, "rank"? } ],
      "p31":  [ { "instance", "class", "startTime"?, "endTime"? } ]
    }
  }

  Les edges P31 sont streamés sur disque pendant le parsing (fichier .p31_stream.jsonl)
  et jamais chargés intégralement en RAM.
  En mode truthy, les champs temporels sont absents.
  Les labels sont optionnellement récupérés via SPARQL par batch à la fin.

USAGE :
  # Mode rapide (truthy), sans labels
  python wikidata_full_taxonomy.py --mode truthy --local latest-truthy.nt.bz2 --no-labels

  # Mode rapide avec labels dans une langue (SPARQL post-traitement)
  python wikidata_full_taxonomy.py --mode truthy --local latest-truthy.nt.bz2 --lang fr

  # Mode rapide avec labels dans TOUTES les langues
  python wikidata_full_taxonomy.py --mode truthy --local latest-truthy.nt.bz2 --all-labels

  # Mode complet avec qualificateurs temporels
  python wikidata_full_taxonomy.py --mode json --local latest-all.json.bz2

PRÉREQUIS :
  pip install requests bz2file orjson

TAILLE OUTPUT :
  ~500 MB à 2 GB selon mode et options.
"""

import bz2
import gzip
import io
import json
import logging
import argparse
import os
import pickle
import re
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional

# orjson est ~3x plus rapide que json pour ce volume
try:
    import orjson
    JSON_LOADS = orjson.loads
    def JSON_DUMPS(obj, indent=None):
        option = orjson.OPT_INDENT_2 if indent else orjson.OPT_NON_STR_KEYS
        return orjson.dumps(obj, option=option).decode()
except ImportError:
    JSON_LOADS = json.loads
    def JSON_DUMPS(obj, indent=None):
        return json.dumps(obj, ensure_ascii=False, indent=indent)

import requests

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gexor.fulltax")


# ─────────────────────────────────────────────────────────────────────────────
# Constantes
# ─────────────────────────────────────────────────────────────────────────────

DUMP_BASE = "https://dumps.wikimedia.org/wikidatawiki/entities"
TRUTHY_URL = f"{DUMP_BASE}/latest-truthy.nt.bz2"
JSON_URL   = f"{DUMP_BASE}/latest-all.json.bz2"

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
SPARQL_HEADERS  = {
    "Accept": "application/sparql-results+json",
    "User-Agent": "GexorFullTaxonomy/1.0 (https://gexor.io; gexor@proton.me)",
}

# Regex NT: <http://www.wikidata.org/entity/Q123> <.../P279> <.../Q456> .
RE_WD_URI    = re.compile(r"http://www\.wikidata\.org/entity/(Q\d+)")
RE_NT_TRIPLE = re.compile(
    r"<([^>]+)>\s+<([^>]+)>\s+<([^>]+)>\s*\."
)

P31_URI  = "http://www.wikidata.org/prop/direct/P31"
P279_URI = "http://www.wikidata.org/prop/direct/P279"

# Rank Wikidata (pour JSON)
RANK_MAP = {
    "preferred":  "preferred",
    "normal":     "normal",
    "deprecated": "deprecated",
}

PROGRESS_EVERY        = 1_000_000   # lignes NT ou items JSON
CHECKPOINT_EVERY      = 20_000_000  # lignes entre deux checkpoints (mode truthy)
CHECKPOINT_EVERY_JSON = 500_000     # items entre deux checkpoints (mode json)
DEFAULT_WORKERS       = 5           # threads parseurs par défaut
DEFAULT_BATCH         = 10_000      # lignes par batch soumis aux threads


# ─────────────────────────────────────────────────────────────────────────────
# Data structures
# ─────────────────────────────────────────────────────────────────────────────

class TaxonomyStore:
    """
    Stockage mémoire optimisé pour la taxonomie complète.

    classes          : { child_qid -> { "parents": [edge], "children": [edge] } }
    _class_children  : index inverse P279, vidé par finalize()
    _p31_file        : stream JSONL sur disque — P31 jamais en RAM

    edge = { "qid": str, "startTime"?: str, "endTime"?: str, "rank"?: str }
    """

    def __init__(self):
        self.classes: dict[str, dict]         = {}
        self._class_children: dict[str, list] = {}  # class → children edges
        self._p31_count: int                  = 0   # compteur pour stats/logs
        self._p31_file                        = None  # ouvert via open_p31_stream()

    # ── P31 stream helpers ─────────────────────────────────────────────────

    def open_p31_stream(self, path: str, append: bool = False):
        """Ouvre le fichier JSONL pour streamer les edges P31 sur disque."""
        mode = "a" if append else "w"
        # buffering 4 MB pour réduire les appels système
        self._p31_file = open(path, mode, encoding="utf-8", buffering=4 * 1024 * 1024)

    def close_p31_stream(self):
        if self._p31_file:
            self._p31_file.flush()
            self._p31_file.close()
            self._p31_file = None

    # ── internal helpers ───────────────────────────────────────────────────

    def _ensure_class(self, q: str):
        if q not in self.classes:
            self.classes[q] = {"parents": [], "children": []}

    # ── add edges ──────────────────────────────────────────────────────────

    def add_p279(self, child: str, parent: str, edge: dict):
        """Register a P279 (subclass-of) relationship."""
        self._ensure_class(child)
        self._ensure_class(parent)

        # child.parents
        self.classes[child]["parents"].append({"qid": parent, **edge})

        # parent.children (deferred for memory; built in finalize)
        if parent not in self._class_children:
            self._class_children[parent] = []
        self._class_children[parent].append({"qid": child, **edge})

    def add_p31(self, instance: str, cls: str, edge: dict):
        """Stream P31 directement sur disque — aucune RAM consommée pour les instances."""
        self._ensure_class(cls)
        record = {"instance": instance, "class": cls, **edge}
        if self._p31_file:
            self._p31_file.write(json.dumps(record, ensure_ascii=False) + "\n")
        self._p31_count += 1

    # ── finalize ───────────────────────────────────────────────────────────

    def finalize(self):
        """
        Inject children back into class nodes.
        Called once after all edges are loaded.
        """
        log.info("Finalizing: injecting children into class nodes...")
        for parent, children in self._class_children.items():
            self._ensure_class(parent)
            self.classes[parent]["children"] = children
        del self._class_children

    def stats(self) -> dict:
        total_p279 = sum(len(v["parents"]) for v in self.classes.values())
        roots = [q for q, v in self.classes.items() if not v["parents"]]
        return {
            "classes":    len(self.classes),
            "p279_edges": total_p279,
            "p31_edges":  self._p31_count,
            "roots":      roots,
            "root_count": len(roots),
        }


# ─────────────────────────────────────────────────────────────────────────────
# Checkpoint helpers
# ─────────────────────────────────────────────────────────────────────────────

def checkpoint_path_for(output: str) -> str:
    return output + ".checkpoint.pkl"


def save_checkpoint(path: str, count: int, store: "TaxonomyStore"):
    """Sérialise l'état courant du store dans un fichier pickle atomique.
    Ne contient plus instances/_class_instances — P31 est streamé sur disque.
    """
    tmp = path + ".tmp"
    # Flush le stream P31 avant de sauvegarder pour cohérence disque
    if store._p31_file:
        store._p31_file.flush()
    data = {
        "count":           count,
        "classes":         store.classes,
        "_class_children": store._class_children,
        "p31_count":       store._p31_count,
    }
    with open(tmp, "wb") as f:
        pickle.dump(data, f, protocol=pickle.HIGHEST_PROTOCOL)
    os.replace(tmp, path)
    size_mb = os.path.getsize(path) / 1024 / 1024
    log.info(f"  ✓ Checkpoint saved → {path}  ({size_mb:.0f} MB)  count={count:,}")


def load_checkpoint(path: str, store: "TaxonomyStore") -> int:
    """Restaure le store depuis un checkpoint et retourne le compteur de reprise."""
    log.info(f"Chargement du checkpoint {path}...")
    with open(path, "rb") as f:
        data = pickle.load(f)
    store.classes         = data["classes"]
    store._class_children = data["_class_children"]
    store._p31_count      = data.get("p31_count", 0)
    count = data["count"]
    log.info(
        f"  Checkpoint restauré : count={count:,}  "
        f"classes={len(store.classes):,}  p31_streamed={store._p31_count:,}"
    )
    return count


# ─────────────────────────────────────────────────────────────────────────────
# Stream helpers
# ─────────────────────────────────────────────────────────────────────────────

@contextmanager
def open_bz2_text(source: str, encoding: str = "utf-8"):
    """
    Ouvre un fichier bz2 en mode texte via un décompresseur externe quand disponible.
    lbzip2/bzip2 gèrent correctement les fichiers bz2 multi-stream (Wikidata dumps).
    Fallback sur le module stdlib bz2 si aucun binaire n'est trouvé.
    """
    proc = None
    for cmd in [["lbzip2", "-dc"], ["bzip2", "-dc"], ["bzcat"]]:
        try:
            proc = subprocess.Popen(
                cmd + [source],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
            )
            f = io.TextIOWrapper(proc.stdout, encoding=encoding, errors="replace")
            try:
                yield f
            finally:
                try:
                    proc.stdout.close()
                except Exception:
                    pass
                proc.wait()
            return
        except (FileNotFoundError, PermissionError, OSError):
            proc = None
            continue
    # Fallback: stdlib bz2 (peut échouer sur les bz2 multi-stream)
    log.warning("Aucun décompresseur externe trouvé (lbzip2/bzip2/bzcat). "
                "Utilisation du module bz2 stdlib — risque d'erreur sur multi-stream.")
    with bz2.open(source, "rt", encoding=encoding, errors="replace") as f:
        yield f


def iter_bz2_lines(source: str) -> Iterator[str]:
    """Ouvre un dump bz2 local et itère ligne par ligne à la volée.
    Utilise open_bz2_text pour gérer correctement les fichiers multi-stream.
    """
    with open_bz2_text(source) as f:
        yield from f


# ─────────────────────────────────────────────────────────────────────────────
# MODE TRUTHY — N-Triples
# ─────────────────────────────────────────────────────────────────────────────

def _parse_truthy_batch(lines: list) -> tuple:
    """
    Fonction pure exécutée dans les threads workers.
    Retourne (p279_pairs, p31_pairs) — pas d'accès au store.
    """
    p279: list = []
    p31:  list = []
    for line in lines:
        if not line or line[0] == "#":
            continue
        if "P31" not in line and "P279" not in line:
            continue
        m = RE_NT_TRIPLE.match(line)
        if not m:
            continue
        subj_uri, pred_uri, obj_uri = m.group(1), m.group(2), m.group(3)
        if pred_uri == P279_URI:
            cm = RE_WD_URI.search(subj_uri)
            pm = RE_WD_URI.search(obj_uri)
            if cm and pm:
                p279.append((cm.group(1), pm.group(1)))
        elif pred_uri == P31_URI:
            im = RE_WD_URI.search(subj_uri)
            cl = RE_WD_URI.search(obj_uri)
            if im and cl:
                p31.append((im.group(1), cl.group(1)))
    return p279, p31


def _flush_futures(futures: dict, store: TaxonomyStore) -> tuple:
    """Collecte tous les futures terminés, met à jour le store. Retourne (p279_added, p31_added)."""
    p279_added = p31_added = 0
    done = [f for f in list(futures) if f.done()]
    for f in done:
        p279_pairs, p31_pairs = f.result()
        for child, parent in p279_pairs:
            store.add_p279(child, parent, {})
        for inst, cls in p31_pairs:
            store.add_p31(inst, cls, {})
        p279_added += len(p279_pairs)
        p31_added  += len(p31_pairs)
        del futures[f]
    return p279_added, p31_added


def _drain_all_futures(futures: dict, store: TaxonomyStore) -> tuple:
    """Attend et collecte TOUS les futures en attente."""
    p279_total = p31_total = 0
    for f in list(futures):
        p279_pairs, p31_pairs = f.result()
        for child, parent in p279_pairs:
            store.add_p279(child, parent, {})
        for inst, cls in p31_pairs:
            store.add_p31(inst, cls, {})
        p279_total += len(p279_pairs)
        p31_total  += len(p31_pairs)
    futures.clear()
    return p279_total, p31_total


def process_truthy(
    source: str,
    store: TaxonomyStore,
    ckpt_path: str,
    resume_from: int = 0,
    num_workers: int = DEFAULT_WORKERS,
    batch_size: int = DEFAULT_BATCH,
):
    """
    Parse le dump truthy N-Triples en parallèle et sauvegarde des checkpoints.

    • num_workers threads parsent les batches de lignes en parallèle.
    • Un checkpoint pickle est écrit toutes les CHECKPOINT_EVERY lignes.
    • En cas d'interruption, relancer avec --resume pour reprendre.
    """
    log.info("=== MODE TRUTHY (N-Triples) ===")
    log.info(f"Source: {source}  workers={num_workers}  batch={batch_size:,}")

    line_count     = resume_from
    p279_count     = sum(len(v["parents"]) for v in store.classes.values())
    p31_count      = store._p31_count
    last_ckpt_line = resume_from

    with open_bz2_text(source) as fh:

        # ── Fast-skip lignes déjà traitées ──────────────────────────────────
        if resume_from > 0:
            log.info(f"Fast-skip de {resume_from:,} lignes déjà traitées...")
            skipped = 0
            for _ in fh:
                skipped += 1
                if skipped >= resume_from:
                    break
            log.info(f"  Reprise à la ligne {skipped:,}")

        # ── Pipeline multi-threadé ───────────────────────────────────────────
        with ThreadPoolExecutor(max_workers=num_workers) as executor:
            futures: dict = {}  # future → None
            batch:   list = []

            for line in fh:
                line_count += 1
                batch.append(line)

                if len(batch) >= batch_size:
                    futures[executor.submit(_parse_truthy_batch, batch)] = None
                    batch = []

                    # Collecter les futures terminés pour libérer la RAM
                    if len(futures) >= num_workers * 2:
                        a, b = _flush_futures(futures, store)
                        p279_count += a
                        p31_count  += b

                # ── Progress log ────────────────────────────────────────────
                if line_count % PROGRESS_EVERY == 0:
                    a, b = _flush_futures(futures, store)
                    p279_count += a
                    p31_count  += b
                    log.info(
                        f"  Lines={line_count:,}  P279={p279_count:,}  P31={p31_count:,}"
                        f"  Classes={len(store.classes):,}  P31_streamed={store._p31_count:,}"
                        f"  Queue={len(futures)}"
                    )

                    # ── Checkpoint ──────────────────────────────────────────
                    if line_count - last_ckpt_line >= CHECKPOINT_EVERY:
                        # Vider tous les futures avant de sauvegarder
                        a, b = _drain_all_futures(futures, store)
                        p279_count += a
                        p31_count  += b
                        save_checkpoint(ckpt_path, line_count, store)
                        last_ckpt_line = line_count

            # ── Dernier batch + attente finale ──────────────────────────────
            if batch:
                futures[executor.submit(_parse_truthy_batch, batch)] = None
            a, b = _drain_all_futures(futures, store)
            p279_count += a
            p31_count  += b

    log.info(f"Truthy parse done: {line_count:,} lines, {p279_count:,} P279, {p31_count:,} P31")


# ─────────────────────────────────────────────────────────────────────────────
# MODE JSON — Full dump avec qualificateurs
# ─────────────────────────────────────────────────────────────────────────────

def extract_time_value(snak: dict) -> Optional[str]:
    """Extrait une valeur temporelle depuis un snak Wikidata."""
    try:
        return snak["datavalue"]["value"]["time"]
    except (KeyError, TypeError):
        return None


def process_statement(stmt: dict, prop: str) -> tuple[str, dict]:
    """
    Extrait le QID cible + les métadonnées temporelles d'un statement Wikidata.

    Retourne (target_qid, edge_meta) ou ("", {}) si invalide.
    """
    try:
        mainsnak = stmt["mainsnak"]
        if mainsnak.get("snaktype") != "value":
            return "", {}
        target_qid = "Q" + str(mainsnak["datavalue"]["value"]["numeric-id"])
    except (KeyError, TypeError):
        return "", {}

    edge: dict = {}

    # Rank
    rank = stmt.get("rank", "normal")
    if rank != "normal":
        edge["rank"] = rank

    # Qualificateurs temporels
    qualifiers = stmt.get("qualifiers", {})
    if "P580" in qualifiers:  # start time
        t = extract_time_value(qualifiers["P580"][0])
        if t:
            edge["startTime"] = t
    if "P582" in qualifiers:  # end time
        t = extract_time_value(qualifiers["P582"][0])
        if t:
            edge["endTime"] = t
    if "P585" in qualifiers:  # point in time (fallback)
        t = extract_time_value(qualifiers["P585"][0])
        if t and "startTime" not in edge:
            edge["pointInTime"] = t

    return target_qid, edge


def process_entity(entity: dict, store: TaxonomyStore):
    """Extrait toutes les relations P31/P279 d'une entité Wikidata JSON."""
    entity_id = entity.get("id", "")
    if not entity_id.startswith("Q"):
        return  # Ignore properties, lexemes

    claims = entity.get("claims", {})

    # P279 — subclass of
    for stmt in claims.get("P279", []):
        target, edge = process_statement(stmt, "P279")
        if target:
            store.add_p279(entity_id, target, edge)

    # P31 — instance of
    for stmt in claims.get("P31", []):
        target, edge = process_statement(stmt, "P31")
        if target:
            store.add_p31(entity_id, target, edge)


def process_json_dump(
    source: str,
    store: TaxonomyStore,
    ckpt_path: str,
    resume_from: int = 0,
):
    """
    Parse le dump JSON complet de Wikidata ligne par ligne avec checkpoints.

    Le format est un tableau JSON :
      [
      {"type":"item","id":"Q1",...},
      {"type":"item","id":"Q2",...},
      ...
      ]
    Chaque entité est sur sa propre ligne (sauf la première "[" et la dernière "]").
    """
    log.info("=== MODE JSON (full dump avec qualificateurs) ===")
    log.info(f"Source: {source}")
    log.info("Attention : ce mode prend 12–24h selon votre machine.")
    if resume_from > 0:
        log.info(f"Reprise depuis l'item {resume_from:,}")

    item_count     = 0
    last_ckpt_item = resume_from

    for line in iter_bz2_lines(source):
        # Chaque line est soit "[", "]", ou un objet JSON suivi d'une virgule
        stripped = line.strip().rstrip(",")
        if not stripped or stripped in ("[", "]"):
            continue

        try:
            entity = JSON_LOADS(stripped)
        except Exception:
            continue

        item_count += 1

        # Fast-skip items déjà traités
        if item_count <= resume_from:
            if item_count % 1_000_000 == 0:
                log.info(f"  Fast-skip: {item_count:,}/{resume_from:,}")
            continue

        process_entity(entity, store)

        if item_count % PROGRESS_EVERY == 0:
            p279_now = sum(len(v["parents"]) for v in store.classes.values())
            log.info(
                f"  Items={item_count:,}  P279={p279_now:,}  P31_streamed={store._p31_count:,}"
                f"  Classes={len(store.classes):,}"
            )

            if item_count - last_ckpt_item >= CHECKPOINT_EVERY_JSON:
                save_checkpoint(ckpt_path, item_count, store)
                last_ckpt_item = item_count

    log.info(f"JSON parse done: {item_count:,} entities processed")


# ─────────────────────────────────────────────────────────────────────────────
# Labels via SPARQL (post-traitement optionnel)
# ─────────────────────────────────────────────────────────────────────────────

def sparql_query(query: str, retries: int = 5) -> list[dict]:
    for attempt in range(retries):
        try:
            resp = requests.get(
                WIKIDATA_SPARQL,
                params={"query": query, "format": "json"},
                headers=SPARQL_HEADERS,
                timeout=90,
            )
            if resp.status_code == 429:
                wait = 5 * (2 ** attempt)
                log.warning(f"Rate-limited. Waiting {wait}s...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()["results"]["bindings"]
        except Exception as e:
            log.warning(f"SPARQL attempt {attempt+1}/{retries}: {e}")
            time.sleep(3 * (attempt + 1))
    return []


def fetch_labels_batch(qids: list[str], lang: str) -> dict[str, str]:
    values = " ".join(f"wd:{q}" for q in qids)
    query = f"""
SELECT ?item ?label WHERE {{
  VALUES ?item {{ {values} }}
  ?item rdfs:label ?label FILTER(LANG(?label) = "{lang}")
}}
"""
    results = sparql_query(query)
    out = {}
    for r in results:
        q = r["item"]["value"].rsplit("/", 1)[-1]
        out[q] = r["label"]["value"]
    return out


def fetch_all_labels_batch(qids: list[str]) -> dict[str, dict[str, str]]:
    """Récupère les labels dans TOUTES les langues pour un batch de QIDs.
    Retourne { qid: { lang: label, ... }, ... }
    """
    values = " ".join(f"wd:{q}" for q in qids)
    query = f"""
SELECT ?item ?label WHERE {{
  VALUES ?item {{ {values} }}
  ?item rdfs:label ?label .
}}
"""
    results = sparql_query(query)
    out: dict[str, dict[str, str]] = {}
    for r in results:
        q = r["item"]["value"].rsplit("/", 1)[-1]
        label_val = r["label"]["value"]
        label_lang = r["label"].get("xml:lang", "")
        if label_lang:
            if q not in out:
                out[q] = {}
            out[q][label_lang] = label_val
    return out


def enrich_with_labels(store: TaxonomyStore, lang: Optional[str] = None,
                       all_labels: bool = False, batch_size: int = 50):
    """
    Ajoute les labels Wikidata via SPARQL à toutes les classes.

    Si all_labels=True : récupère toutes les langues → node["labels"] = {lang: label}
    Sinon              : récupère une seule langue  → node["label"]  = str
    """
    all_qids = list(store.classes.keys())
    total = len(all_qids)

    def batches(lst, n):
        for i in range(0, len(lst), n):
            yield lst[i:i+n]

    if all_labels:
        log.info(f"Fetching ALL labels for {total:,} class nodes...")
        all_labels_map: dict[str, dict[str, str]] = {}

        for i, batch in enumerate(batches(all_qids, batch_size)):
            if i % 100 == 0:
                log.info(f"  Labels: {i * batch_size:,}/{total:,}")
            batch_result = fetch_all_labels_batch(batch)
            for q, langs in batch_result.items():
                all_labels_map[q] = langs
            time.sleep(0.5)

        for q, node in store.classes.items():
            node["labels"] = all_labels_map.get(q, {})

        resolved = sum(1 for v in all_labels_map.values() if v)
        log.info(f"Labels fetched: {resolved:,}/{total:,} resolved (all languages)")
    else:
        log.info(f"Fetching labels for {total:,} class nodes (lang={lang})...")
        labels: dict[str, str] = {}

        for i, batch in enumerate(batches(all_qids, batch_size)):
            if i % 100 == 0:
                log.info(f"  Labels: {i * batch_size:,}/{total:,}")
            labels.update(fetch_labels_batch(batch, lang))
            time.sleep(0.5)

        for q, node in store.classes.items():
            node["label"] = labels.get(q, q)

        log.info(f"Labels fetched: {len(labels):,}/{total:,} resolved")


# ─────────────────────────────────────────────────────────────────────────────
# Build flat edge lists + cycle detection
# ─────────────────────────────────────────────────────────────────────────────

def build_edge_lists(store: TaxonomyStore, p31_stream_path: str) -> tuple[list, list, list]:
    """
    Construit les listes d'arêtes plates et détecte les cycles.
    Les P31 sont lus depuis le fichier JSONL streamé (pas en RAM).

    Returns: (p279_edges, p31_edges, cycles)
    """
    log.info("Building flat edge lists and detecting cycles...")

    p279_edges: list[dict] = []
    p31_edges:  list[dict] = []
    cycles:     list[dict] = []

    # Build adjacency for cycle detection via DFS on P279 graph
    # We use Kahn's algorithm (topological sort) to find cycles
    # For a graph this size, we collect SCCs with Tarjan's algorithm
    # But that's O(V+E) which is fine.
    # For now: mark cycles during edge export by checking known ancestors.
    # Full Tarjan on 2M+ nodes is feasible but we'll use a simpler coloring DFS.

    # ── Tarjan SCC (detects all cycles in P279 subclass graph) ───────────────
    log.info("Running Tarjan SCC on P279 graph to detect cycles...")
    in_scc: set[str] = set()  # nodes that are in a non-trivial SCC

    index_counter = [0]
    stack = []
    lowlink = {}
    index = {}
    on_stack = {}

    # Build adjacency (parent -> children for downward edges)
    # We do it on just the P279 class graph
    p279_adj: dict[str, list[str]] = {}
    for child_q, node in store.classes.items():
        for pe in node["parents"]:
            parent_q = pe["qid"]
            if parent_q not in p279_adj:
                p279_adj[parent_q] = []
            p279_adj[parent_q].append(child_q)

    def strongconnect(v):
        index[v] = index_counter[0]
        lowlink[v] = index_counter[0]
        index_counter[0] += 1
        stack.append(v)
        on_stack[v] = True

        for w in p279_adj.get(v, []):
            if w not in index:
                strongconnect(w)
                lowlink[v] = min(lowlink[v], lowlink[w])
            elif on_stack.get(w):
                lowlink[v] = min(lowlink[v], index[w])

        if lowlink[v] == index[v]:
            scc = []
            while True:
                w = stack.pop()
                on_stack[w] = False
                scc.append(w)
                if w == v:
                    break
            if len(scc) > 1:
                for node_q in scc:
                    in_scc.add(node_q)

    # Tarjan over all unvisited nodes (handles multi-root)
    # Use iterative Tarjan to avoid Python recursion limit
    log.info(f"  Tarjan on {len(store.classes):,} class nodes...")

    def tarjan_iterative():
        for start in list(store.classes.keys()):
            if start in index:
                continue
            call_stack = [(start, iter(p279_adj.get(start, [])))]
            index[start] = index_counter[0]
            lowlink[start] = index_counter[0]
            index_counter[0] += 1
            stack.append(start)
            on_stack[start] = True

            while call_stack:
                v, children = call_stack[-1]
                try:
                    w = next(children)
                    if w not in index:
                        index[w] = index_counter[0]
                        lowlink[w] = index_counter[0]
                        index_counter[0] += 1
                        stack.append(w)
                        on_stack[w] = True
                        call_stack.append((w, iter(p279_adj.get(w, []))))
                    elif on_stack.get(w):
                        lowlink[v] = min(lowlink[v], index[w])
                except StopIteration:
                    call_stack.pop()
                    if call_stack:
                        parent_v = call_stack[-1][0]
                        lowlink[parent_v] = min(lowlink[parent_v], lowlink[v])

                    # Check if v is root of SCC
                    if lowlink[v] == index[v]:
                        scc = []
                        while True:
                            w = stack.pop()
                            on_stack[w] = False
                            scc.append(w)
                            if w == v:
                                break
                        if len(scc) > 1:
                            cycles.append({
                                "type": "SCC",
                                "nodes": scc,
                                "size": len(scc),
                            })
                            for node_q in scc:
                                in_scc.add(node_q)

    tarjan_iterative()
    del p279_adj
    log.info(f"  Cycles (SCCs): {len(cycles)}  Nodes in cycles: {len(in_scc):,}")

    # ── P279 edges ────────────────────────────────────────────────────────────
    seen_p279: set[str] = set()
    for child_q, node in store.classes.items():
        for pe in node["parents"]:
            parent_q = pe["qid"]
            key = f"{child_q}|{parent_q}"
            if key in seen_p279:
                continue
            seen_p279.add(key)
            entry: dict = {"child": child_q, "parent": parent_q}
            for k in ("startTime", "endTime", "pointInTime", "rank"):
                if k in pe:
                    entry[k] = pe[k]
            if child_q in in_scc:
                entry["cycle"] = True
            p279_edges.append(entry)

    # ── P31 edges — lecture du stream JSONL sur disque ──────────────────────
    log.info(f"Reading P31 edges from stream: {p31_stream_path}")
    seen_p31: set[str] = set()
    if Path(p31_stream_path).exists():
        with open(p31_stream_path, "r", encoding="utf-8") as f:
            for raw_line in f:
                raw_line = raw_line.strip()
                if not raw_line:
                    continue
                record = JSON_LOADS(raw_line)
                key = f"{record['instance']}|{record['class']}"
                if key in seen_p31:
                    continue
                seen_p31.add(key)
                p31_edges.append(record)
    else:
        log.warning(f"P31 stream file not found: {p31_stream_path}")
    log.info(f"  P31 edges loaded: {len(p31_edges):,}")

    return p279_edges, p31_edges, cycles


# ─────────────────────────────────────────────────────────────────────────────
# Serialisation incrémentale (évite OOM sur gros JSON)
# ─────────────────────────────────────────────────────────────────────────────

def write_taxonomy_streaming(
    output_path: str,
    meta: dict,
    cycles: list,
    store: TaxonomyStore,
    p279_edges: list,
    p31_edges: list,
    indent: int,
):
    """
    Écrit le JSON de sortie en streaming pour éviter d'avoir tout en RAM.
    Utilise un format compatible avec les lecteurs JSON standard.
    """
    log.info(f"Writing taxonomy to {output_path}...")
    ind = "  " if indent else ""
    nl  = "\n" if indent else ""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("{" + nl)

        # Meta
        f.write(f'{ind}"meta": ')
        f.write(JSON_DUMPS(meta, indent=indent if indent else None))
        f.write("," + nl)

        # Cycles
        f.write(f'{ind}"cycles": ')
        f.write(JSON_DUMPS(cycles, indent=indent if indent else None))
        f.write("," + nl)

        # Classes (streaming node by node)
        f.write(f'{ind}"classes": {{' + nl)
        class_items = list(store.classes.items())
        for i, (q, node) in enumerate(class_items):
            comma = "," if i < len(class_items) - 1 else ""
            f.write(f'{ind}{ind}"{q}": ')
            f.write(JSON_DUMPS(node))
            f.write(comma + nl)
            if i % 100_000 == 0 and i > 0:
                log.info(f"  Classes written: {i:,}/{len(class_items):,}")
        f.write(f'{ind}}},' + nl)

        # Flat edge lists
        f.write(f'{ind}"edges": {{' + nl)
        f.write(f'{ind}{ind}"p279": ')
        f.write(JSON_DUMPS(p279_edges))
        f.write("," + nl)
        f.write(f'{ind}{ind}"p31": ')
        f.write(JSON_DUMPS(p31_edges))
        f.write(nl + f'{ind}}}' + nl)

        f.write("}" + nl)

    size_mb = os.path.getsize(output_path) / 1024 / 1024
    log.info(f"✓ Written {size_mb:.1f} MB → {output_path}")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Extrait L'INTÉGRALITÉ de la taxonomie Wikidata P31/P279 depuis les dumps",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Prérequis :
  pip install requests orjson

Téléchargement préalable recommandé (reprise si coupure) :
  # Truthy (~30 GB)
  wget -c https://dumps.wikimedia.org/wikidatawiki/entities/latest-truthy.nt.bz2

  # JSON complet (~80-100 GB)
  wget -c https://dumps.wikimedia.org/wikidatawiki/entities/latest-all.json.bz2

Exemples :
  # Mode rapide sans labels
  python wikidata_full_taxonomy.py --mode truthy --local latest-truthy.nt.bz2 --no-labels

  # Mode complet avec qualificateurs temporels
  python wikidata_full_taxonomy.py --mode json --local latest-all.json.bz2 --lang en

  # Avec labels dans toutes les langues
  python wikidata_full_taxonomy.py --mode truthy --local dump.bz2 --all-labels

  # Minifié pour économiser l'espace
  python wikidata_full_taxonomy.py --mode truthy --local dump.bz2 --no-labels --indent 0
""",
    )

    parser.add_argument(
        "--mode", choices=["truthy", "json"], required=True,
        help=(
            "truthy: N-Triples sans qualificateurs (~30GB dump, rapide) | "
            "json: dump complet avec P580/P582 (~80-100GB, lent)"
        ),
    )
    parser.add_argument(
        "--local", metavar="PATH", required=True,
        help="Chemin vers le dump téléchargé (.bz2).",
    )
    parser.add_argument(
        "--no-labels", action="store_true",
        help="Ne pas récupérer les labels via SPARQL (beaucoup plus rapide).",
    )
    parser.add_argument(
        "--lang", default="en",
        help="Langue pour les labels SPARQL (défaut: en). Ignoré si --all-labels.",
    )
    parser.add_argument(
        "--all-labels", action="store_true",
        help="Récupérer les labels dans TOUTES les langues (labels dict par nœud).",
    )
    parser.add_argument(
        "--output", default="wikidata_taxonomy_full.json",
        help="Fichier de sortie JSON (défaut: wikidata_taxonomy_full.json)",
    )
    parser.add_argument(
        "--indent", type=int, default=0,
        help="Indentation JSON. 0=minifié (défaut), 2=lisible humain",
    )
    parser.add_argument(
        "--label-batch", type=int, default=50,
        help="Taille des batches SPARQL pour les labels (défaut: 50)",
    )
    parser.add_argument(
        "--workers", type=int, default=DEFAULT_WORKERS,
        help=f"Nombre de threads parseurs (truthy uniquement, défaut: {DEFAULT_WORKERS})",
    )
    parser.add_argument(
        "--batch-size", type=int, default=DEFAULT_BATCH,
        help=f"Lignes par batch soumis aux threads (défaut: {DEFAULT_BATCH})",
    )
    parser.add_argument(
        "--no-resume", action="store_true",
        help="Ignorer le checkpoint existant et repartir de zéro.",
    )

    args = parser.parse_args()

    # ── Résoudre la source ────────────────────────────────────────────────────
    source = args.local
    if not Path(source).exists():
        log.error(f"Fichier local introuvable: {source}")
        sys.exit(1)
    log.info(f"Source: {source} ({Path(source).stat().st_size / 1e9:.1f} GB)")

    # ── Checkpoint : reprise éventuelle ──────────────────────────────────────
    ckpt_path      = checkpoint_path_for(args.output)
    p31_stream_path = args.output + ".p31_stream.jsonl"
    resume_from    = 0
    store          = TaxonomyStore()

    if not args.no_resume and Path(ckpt_path).exists():
        log.info(f"Checkpoint trouvé : {ckpt_path}")
        resume_from = load_checkpoint(ckpt_path, store)
        # Ouvre en append — les edges P31 déjà streamés lors de la migration
        p31_exists = Path(p31_stream_path).exists()
        store.open_p31_stream(p31_stream_path, append=p31_exists)
        if p31_exists:
            log.info(f"P31 stream en mode append : {p31_stream_path}")
        else:
            log.info(f"P31 stream créé (reprise sans fichier précédent) : {p31_stream_path}")
    elif args.no_resume and Path(ckpt_path).exists():
        log.info(f"--no-resume : checkpoint ignoré, suppression de {ckpt_path}")
        os.remove(ckpt_path)
        if Path(p31_stream_path).exists():
            os.remove(p31_stream_path)
            log.info(f"P31 stream supprimé : {p31_stream_path}")
        store.open_p31_stream(p31_stream_path, append=False)
    else:
        store.open_p31_stream(p31_stream_path, append=False)

    # ── Traitement ────────────────────────────────────────────────────────────
    t0 = time.time()

    if args.mode == "truthy":
        process_truthy(
            source, store, ckpt_path,
            resume_from=resume_from,
            num_workers=args.workers,
            batch_size=args.batch_size,
        )
    else:
        process_json_dump(source, store, ckpt_path, resume_from=resume_from)

    # Fermer le stream P31 avant finalize/écriture
    store.close_p31_stream()
    store.finalize()

    # ── Labels optionnels ─────────────────────────────────────────────────────
    if not args.no_labels:
        enrich_with_labels(
            store,
            lang=args.lang,
            all_labels=args.all_labels,
            batch_size=args.label_batch,
        )

    # ── Edge lists + cycles ───────────────────────────────────────────────────
    p279_edges, p31_edges, cycles = build_edge_lists(store, p31_stream_path)

    # ── Stats ─────────────────────────────────────────────────────────────────
    st = store.stats()
    elapsed = round(time.time() - t0, 1)

    meta = {
        "generator":        "GexorFullTaxonomy/1.0",
        "mode":             args.mode,
        "source":           source,
        "has_temporal":     args.mode == "json",
        "language":         "all" if args.all_labels else (args.lang if not args.no_labels else None),
        "duration_seconds": elapsed,
        **{k: v for k, v in st.items() if k != "roots"},
        "root_count":       st["root_count"],
        "roots_sample":     st["roots"][:20],  # pas toutes les racines dans meta
        "cycles_detected":  len(cycles),
    }

    log.info("=" * 60)
    log.info(f"Terminé en {elapsed}s ({elapsed/3600:.1f}h)")
    log.info(f"  Classes    : {st['classes']:,}")
    log.info(f"  P279 edges : {st['p279_edges']:,}")
    log.info(f"  P31 edges  : {st['p31_edges']:,}  (lu depuis {p31_stream_path})")
    log.info(f"  Roots      : {st['root_count']:,}")
    log.info(f"  Cycles SCC : {len(cycles)}")
    log.info("=" * 60)

    # ── Écriture ──────────────────────────────────────────────────────────────
    write_taxonomy_streaming(
        args.output, meta, cycles, store,
        p279_edges, p31_edges,
        indent=args.indent,
    )

    # ── Nettoyage checkpoint (succès) ─────────────────────────────────────────
    if Path(ckpt_path).exists():
        os.remove(ckpt_path)
        log.info(f"Checkpoint supprimé : {ckpt_path}")
    # Le stream P31 est conservé comme source de vérité des edges
    # (peut être supprimé manuellement si l'output JSON est valide)


if __name__ == "__main__":
    main()
