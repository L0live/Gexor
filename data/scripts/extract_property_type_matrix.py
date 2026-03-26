#!/usr/bin/env python3
"""
Gexor — Property-Type Matrix Extractor
========================================
Extrait une matrice (P31 type × PID) depuis le dump truthy Wikidata.

Pour chaque type P31, compte combien d'entités de ce type possèdent chaque propriété.
Résultat : un JSON utilisable par le SearchModal pour suggérer les filtres propriété
les plus pertinents selon le type sélectionné.

STRATÉGIE (2 passes) :
  Passe 1 — Lire le fichier .p31_stream.jsonl (produit par wikidata_full_taxonomy.py)
            pour construire l'index instance → [types P31].
  Passe 2 — Scanner le dump truthy N-Triples pour collecter tous les PIDs de chaque
            entité et incrémenter la matrice type×PID.

  Alternative (1 passe) : si le dump truthy est déjà trié par sujet, on peut faire
  les deux en une seule passe. Ce script supporte les deux modes.

SORTIE :
  property_type_matrix.json — { meta, matrix: { Q5: { label, totalEntities, properties: { P106: { count, pct } } } } }

USAGE :
  # Mode 2 passes (recommandé si .p31_stream.jsonl existe)
  python extract_property_type_matrix.py \
    --p31-stream ../wikidata_taxonomy_full.json.p31_stream.jsonl \
    --dump latest-truthy.nt.bz2 \
    --taxonomy taxonomy_clean.json \
    --top-types 5000

  # Avec une taxonomy light déjà nettoyée (filtre les types à tracker)
  python extract_property_type_matrix.py \
    --p31-stream ../wikidata_taxonomy_full.json.p31_stream.jsonl \
    --dump latest-truthy.nt.bz2 \
    --taxonomy taxonomy_light.json \
    --top-types 5000

  # Sans taxonomy (track tous les types du p31_stream, plus lent et plus gros)
  python extract_property_type_matrix.py \
    --p31-stream ../wikidata_taxonomy_full.json.p31_stream.jsonl \
    --dump latest-truthy.nt.bz2 \
    --top-types 5000

PRÉREQUIS :
  pip install orjson  (optionnel, ~3x plus rapide)
  lbzip2 ou bzip2 pour la décompression du dump

TAILLE OUTPUT :
  ~2-10 MB selon --top-types et --min-property-count.
"""

import argparse
import bz2
import io
import json
import logging
import os
import pickle
import re
import subprocess
import sys
import time
from collections import defaultdict
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional

try:
    import orjson
    def json_loads(s):
        return orjson.loads(s)
    def json_dumps(obj, indent=None):
        opts = orjson.OPT_INDENT_2 if indent else 0
        return orjson.dumps(obj, option=opts).decode("utf-8")
except ImportError:
    def json_loads(s):
        return json.loads(s)
    def json_dumps(obj, indent=None):
        return json.dumps(obj, indent=indent, ensure_ascii=False)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gexor.propmatrix")

# ─────────────────────────────────────────────────────────────────────────────
# Constantes
# ─────────────────────────────────────────────────────────────────────────────

RE_NT_TRIPLE = re.compile(
    r"<([^>]+)>\s+<([^>]+)>\s+<([^>]+)>\s*\."
)
RE_WD_ENTITY = re.compile(r"http://www\.wikidata\.org/entity/(Q\d+)")
RE_WD_PROP = re.compile(r"http://www\.wikidata\.org/prop/direct/(P\d+)")

PROGRESS_EVERY = 5_000_000
CHECKPOINT_EVERY = 50_000_000


# ─────────────────────────────────────────────────────────────────────────────
# BZ2 decompression helpers (same pattern as wikidata_full_taxonomy.py)
# ─────────────────────────────────────────────────────────────────────────────

@contextmanager
def open_bz2_text(source: str, encoding: str = "utf-8"):
    """
    Ouvre un fichier bz2 via décompresseur externe (lbzip2/bzip2/bzcat) si disponible.
    Fallback sur le module stdlib bz2.
    """
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
            continue
    log.warning("Aucun décompresseur externe trouvé. Utilisation du module bz2 stdlib.")
    with bz2.open(source, "rt", encoding=encoding, errors="replace") as f:
        yield f


# ─────────────────────────────────────────────────────────────────────────────
# Passe 1 : Charger l'index instance → types P31
# ─────────────────────────────────────────────────────────────────────────────

def load_p31_index(
    p31_stream_path: str,
    tracked_types: Optional[set[str]] = None,
) -> tuple[dict[str, list[str]], dict[str, int]]:
    """
    Lit le fichier .p31_stream.jsonl et construit :
      - instance_types: { instanceQid: [typeQid, ...] }
      - type_counts:    { typeQid: nombre d'instances directes }

    Si tracked_types est fourni, seuls ces types sont indexés (réduit la RAM).
    """
    log.info(f"Pass 1: Loading P31 index from {p31_stream_path}...")
    size_mb = os.path.getsize(p31_stream_path) / 1024 / 1024
    log.info(f"  File size: {size_mb:.1f} MB")

    instance_types: dict[str, list[str]] = {}
    type_counts: dict[str, int] = defaultdict(int)
    line_count = 0
    skipped = 0

    with open(p31_stream_path, "r", encoding="utf-8") as f:
        for line in f:
            line_count += 1
            line = line.strip()
            if not line:
                continue
            try:
                edge = json_loads(line)
                instance = edge.get("instance", "")
                cls = edge.get("class", "")
                if not instance or not cls:
                    continue

                # Filtrer par types trackés si spécifié
                if tracked_types and cls not in tracked_types:
                    skipped += 1
                    continue

                if instance not in instance_types:
                    instance_types[instance] = []
                instance_types[instance].append(cls)
                type_counts[cls] += 1

            except Exception:
                continue

            if line_count % 2_000_000 == 0:
                log.info(
                    f"  P31 lines: {line_count:,}  "
                    f"instances: {len(instance_types):,}  "
                    f"types: {len(type_counts):,}  "
                    f"skipped: {skipped:,}"
                )

    log.info(
        f"  ✓ P31 index loaded: {len(instance_types):,} instances, "
        f"{len(type_counts):,} types, {line_count:,} lines"
    )
    return instance_types, dict(type_counts)


# ─────────────────────────────────────────────────────────────────────────────
# Passe 2 : Scanner le dump truthy pour collecter les PIDs par entité
# ─────────────────────────────────────────────────────────────────────────────

def build_matrix_from_dump(
    dump_path: str,
    instance_types: dict[str, list[str]],
    type_counts: dict[str, int],
    checkpoint_path: Optional[str] = None,
    resume_from: int = 0,
) -> dict[str, dict[str, int]]:
    """
    Scanne le dump N-Triples truthy. Pour chaque triplet <Q... P... ...>,
    si Q est dans instance_types, incrémente matrix[type][pid] pour chacun de ses types.

    Returns: { typeQid: { pid: count } }
    """
    log.info(f"Pass 2: Scanning dump {dump_path} for property matrix...")

    # matrix[type_qid][pid] = count
    matrix: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    # Restore from checkpoint if available
    if checkpoint_path and os.path.exists(checkpoint_path) and resume_from == 0:
        log.info(f"  Loading checkpoint from {checkpoint_path}...")
        with open(checkpoint_path, "rb") as f:
            ckpt = pickle.load(f)
        matrix = defaultdict(lambda: defaultdict(int), ckpt["matrix"])
        resume_from = ckpt["line_count"]
        log.info(f"  Checkpoint restored: line_count={resume_from:,}")

    line_count = 0
    matched = 0
    last_ckpt = resume_from

    # Track PIDs seen per entity (since dump is sorted by subject,
    # we deduplicate PIDs per entity to count "entity has PID" not "entity has N values for PID")
    current_entity: str = ""
    current_pids: set[str] = set()

    def flush_entity():
        """Flush accumulated PIDs for the current entity into the matrix."""
        nonlocal matched
        if not current_entity or current_entity not in instance_types:
            return
        types = instance_types[current_entity]
        for pid in current_pids:
            for t in types:
                matrix[t][pid] += 1
        matched += 1

    with open_bz2_text(dump_path) as fh:
        # Fast-skip if resuming
        if resume_from > 0:
            log.info(f"  Fast-skipping {resume_from:,} lines...")
            skipped = 0
            for _ in fh:
                skipped += 1
                if skipped >= resume_from:
                    break
            log.info(f"  Resumed at line {skipped:,}")

        for line in fh:
            line_count += 1

            # Quick filter: skip lines without entity URIs
            if "/entity/Q" not in line or "/prop/direct/P" not in line:
                if line_count % PROGRESS_EVERY == 0:
                    total = resume_from + line_count
                    log.info(
                        f"  Lines: {total:,}  matched: {matched:,}  "
                        f"types in matrix: {len(matrix):,}"
                    )
                continue

            m = RE_NT_TRIPLE.match(line)
            if not m:
                continue

            subj_uri, pred_uri, obj_uri = m.group(1), m.group(2), m.group(3)

            # Extract entity QID from subject
            entity_m = RE_WD_ENTITY.search(subj_uri)
            if not entity_m:
                continue
            entity_qid = entity_m.group(1)

            # Extract PID from predicate
            pid_m = RE_WD_PROP.search(pred_uri)
            if not pid_m:
                continue
            pid = pid_m.group(1)

            # Entity changed → flush previous
            if entity_qid != current_entity:
                flush_entity()
                current_entity = entity_qid
                current_pids = set()

            current_pids.add(pid)

            # Progress
            if line_count % PROGRESS_EVERY == 0:
                total = resume_from + line_count
                log.info(
                    f"  Lines: {total:,}  matched: {matched:,}  "
                    f"types in matrix: {len(matrix):,}"
                )

            # Checkpoint
            if checkpoint_path and line_count % CHECKPOINT_EVERY == 0 and line_count != last_ckpt:
                flush_entity()
                # Convert defaultdict to regular dict for pickle
                ckpt_data = {
                    "line_count": resume_from + line_count,
                    "matrix": {t: dict(pids) for t, pids in matrix.items()},
                }
                tmp = checkpoint_path + ".tmp"
                with open(tmp, "wb") as f:
                    pickle.dump(ckpt_data, f, protocol=pickle.HIGHEST_PROTOCOL)
                os.replace(tmp, checkpoint_path)
                last_ckpt = line_count
                size_mb = os.path.getsize(checkpoint_path) / 1024 / 1024
                log.info(f"  ✓ Checkpoint saved ({size_mb:.0f} MB)")

        # Flush last entity
        flush_entity()

    total_lines = resume_from + line_count
    log.info(
        f"  ✓ Dump scan complete: {total_lines:,} lines, "
        f"{matched:,} entities matched, {len(matrix):,} types"
    )

    return {t: dict(pids) for t, pids in matrix.items()}


# ─────────────────────────────────────────────────────────────────────────────
# Load tracked types from taxonomy
# ─────────────────────────────────────────────────────────────────────────────

def load_tracked_types(taxonomy_path: str, top_n: Optional[int] = None) -> set[str]:
    """
    Charge les types à tracker depuis un fichier taxonomy (clean ou light).
    Si top_n est spécifié, ne garder que les top N par totalInstances.
    """
    log.info(f"Loading tracked types from {taxonomy_path}...")
    with open(taxonomy_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    classes = data.get("classes", {})
    log.info(f"  Taxonomy has {len(classes):,} classes")

    if top_n and top_n < len(classes):
        # Trier par totalInstances desc et garder top N
        sorted_qids = sorted(
            classes.keys(),
            key=lambda q: classes[q].get("totalInstances", classes[q].get("directInstances", 0)),
            reverse=True,
        )
        tracked = set(sorted_qids[:top_n])
        log.info(f"  Tracking top {top_n} types by instance count")
    else:
        tracked = set(classes.keys())

    log.info(f"  ✓ Tracking {len(tracked):,} types")
    return tracked


def load_taxonomy_labels(taxonomy_path: str) -> dict[str, str]:
    """
    Charge les labels (préférence : en, puis fr, puis premier disponible)
    depuis un fichier taxonomy.
    """
    with open(taxonomy_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    labels: dict[str, str] = {}
    for qid, node in data.get("classes", {}).items():
        node_labels = node.get("labels", {})
        if isinstance(node_labels, dict):
            label = (
                node_labels.get("en")
                or node_labels.get("fr")
                or next(iter(node_labels.values()), None)
            )
            if label:
                labels[qid] = label
    return labels


# ─────────────────────────────────────────────────────────────────────────────
# Build output
# ─────────────────────────────────────────────────────────────────────────────

def build_output(
    matrix: dict[str, dict[str, int]],
    type_counts: dict[str, int],
    labels: dict[str, str],
    top_types: int,
    min_property_count: int,
    max_properties_per_type: int,
) -> dict:
    """
    Transforme la matrice brute en JSON de sortie.
    Filtre par top_types, min_property_count, calcule les pourcentages.
    """
    log.info("Building output matrix...")

    # Sélectionner les top types par nombre d'entités
    type_list = sorted(
        matrix.keys(),
        key=lambda t: type_counts.get(t, 0),
        reverse=True,
    )[:top_types]

    output_matrix: dict = {}

    for type_qid in type_list:
        total_entities = type_counts.get(type_qid, 0)
        if total_entities == 0:
            continue

        pids = matrix.get(type_qid, {})

        # Filtrer par min count et trier par fréquence
        filtered_pids = {
            pid: count
            for pid, count in pids.items()
            if count >= min_property_count
        }

        # Top N propriétés par type
        sorted_pids = sorted(
            filtered_pids.items(),
            key=lambda x: x[1],
            reverse=True,
        )[:max_properties_per_type]

        properties: dict = {}
        for pid, count in sorted_pids:
            pct = round(count / total_entities * 100, 1)
            properties[pid] = {"count": count, "pct": pct}

        if not properties:
            continue

        entry: dict = {
            "totalEntities": total_entities,
            "properties": properties,
        }
        if type_qid in labels:
            entry["label"] = labels[type_qid]

        output_matrix[type_qid] = entry

    log.info(f"  ✓ Output: {len(output_matrix):,} types, "
             f"avg {sum(len(v['properties']) for v in output_matrix.values()) / max(len(output_matrix), 1):.0f} properties/type")

    return output_matrix


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Gexor — Extract property-type matrix from Wikidata truthy dump",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic usage with p31 stream and truthy dump
  python extract_property_type_matrix.py \\
    --p31-stream wikidata_taxonomy_full.json.p31_stream.jsonl \\
    --dump /path/to/latest-truthy.nt.bz2 \\
    --top-types 5000

  # With taxonomy to filter tracked types
  python extract_property_type_matrix.py \\
    --p31-stream wikidata_taxonomy_full.json.p31_stream.jsonl \\
    --dump /path/to/latest-truthy.nt.bz2 \\
    --taxonomy taxonomy_clean.json \\
    --top-types 5000
        """,
    )
    parser.add_argument(
        "--p31-stream",
        required=True,
        help="Path to .p31_stream.jsonl (from wikidata_full_taxonomy.py)",
    )
    parser.add_argument(
        "--dump",
        required=True,
        help="Path to latest-truthy.nt.bz2 (Wikidata truthy dump)",
    )
    parser.add_argument(
        "--taxonomy",
        default=None,
        help="Path to taxonomy JSON (clean or light) to restrict tracked types",
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Output path (default: <script_dir>/property_type_matrix.json)",
    )
    parser.add_argument(
        "--top-types",
        type=int,
        default=5000,
        help="Number of top types to include in output (default: 5000)",
    )
    parser.add_argument(
        "--min-property-count",
        type=int,
        default=10,
        help="Minimum entity count for a property to be included (default: 10)",
    )
    parser.add_argument(
        "--max-properties-per-type",
        type=int,
        default=200,
        help="Maximum properties per type in output (default: 200)",
    )
    parser.add_argument(
        "--track-top-types",
        type=int,
        default=None,
        help="Only track top N types during pass 1 (reduces RAM). "
             "Requires --taxonomy. Default: track all types from taxonomy.",
    )
    parser.add_argument(
        "--checkpoint",
        default=None,
        help="Checkpoint file path for pass 2 resume (default: <output>.checkpoint.pkl)",
    )
    parser.add_argument(
        "--no-checkpoint",
        action="store_true",
        help="Disable checkpointing",
    )

    args = parser.parse_args()

    script_dir = str(Path(__file__).parent)
    output_path = args.output or os.path.join(script_dir, "property_type_matrix.json")
    checkpoint_path = args.checkpoint or (output_path + ".checkpoint.pkl")
    if args.no_checkpoint:
        checkpoint_path = None

    t0 = time.time()

    # ── Load tracked types from taxonomy ──────────────────────────────────
    tracked_types: Optional[set[str]] = None
    labels: dict[str, str] = {}

    if args.taxonomy:
        tracked_types = load_tracked_types(args.taxonomy, args.track_top_types)
        labels = load_taxonomy_labels(args.taxonomy)

    # ── Pass 1: P31 index ─────────────────────────────────────────────────
    instance_types, type_counts = load_p31_index(args.p31_stream, tracked_types)

    # Memory estimate
    instance_count = len(instance_types)
    avg_types = sum(len(t) for t in instance_types.values()) / max(instance_count, 1)
    log.info(f"  Memory estimate: {instance_count:,} instances × {avg_types:.1f} types/instance")

    # ── Pass 2: Dump scan ─────────────────────────────────────────────────
    matrix = build_matrix_from_dump(
        args.dump,
        instance_types,
        type_counts,
        checkpoint_path=checkpoint_path,
    )

    # Free memory before building output
    del instance_types

    # ── Build output ──────────────────────────────────────────────────────
    output_matrix = build_output(
        matrix,
        type_counts,
        labels,
        top_types=args.top_types,
        min_property_count=args.min_property_count,
        max_properties_per_type=args.max_properties_per_type,
    )

    elapsed = time.time() - t0

    meta = {
        "version": "1.0",
        "generator": "GexorPropertyTypeMatrix/1.0",
        "source": os.path.basename(args.dump),
        "p31_source": os.path.basename(args.p31_stream),
        "taxonomy": os.path.basename(args.taxonomy) if args.taxonomy else None,
        "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "topTypes": len(output_matrix),
        "totalProperties": len({
            pid
            for entry in output_matrix.values()
            for pid in entry["properties"]
        }),
        "minPropertyCount": args.min_property_count,
        "maxPropertiesPerType": args.max_properties_per_type,
        "durationSeconds": round(elapsed, 1),
    }

    output = {
        "meta": meta,
        "matrix": output_matrix,
    }

    # ── Write ─────────────────────────────────────────────────────────────
    log.info(f"Writing output to {output_path}...")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(json_dumps(output, indent=2))

    size_mb = os.path.getsize(output_path) / 1024 / 1024
    log.info(f"  ✓ Written {size_mb:.1f} MB → {output_path}")

    # ── Cleanup checkpoint ────────────────────────────────────────────────
    if checkpoint_path and os.path.exists(checkpoint_path):
        os.remove(checkpoint_path)
        log.info(f"  Checkpoint removed: {checkpoint_path}")

    # ── Report ────────────────────────────────────────────────────────────
    log.info("")
    log.info("=" * 60)
    log.info(f"  DONE in {elapsed:.1f}s ({elapsed/3600:.1f}h)")
    log.info(f"  Types in output:     {len(output_matrix):>10,}")
    log.info(f"  Unique PIDs:         {meta['totalProperties']:>10,}")
    log.info(f"  Output size:         {size_mb:>10.1f} MB")
    log.info("=" * 60)

    # ── Top 10 types by entity count ──────────────────────────────────────
    log.info("")
    log.info("Top 10 types by entity count:")
    top10 = sorted(
        output_matrix.items(),
        key=lambda x: x[1]["totalEntities"],
        reverse=True,
    )[:10]
    for qid, entry in top10:
        label = entry.get("label", qid)
        n_props = len(entry["properties"])
        top_pid = max(entry["properties"], key=lambda p: entry["properties"][p]["count"]) if entry["properties"] else "?"
        log.info(
            f"  {qid:12s}  {label:30s}  "
            f"entities={entry['totalEntities']:>10,}  "
            f"props={n_props:>4d}  "
            f"top_pid={top_pid}"
        )


if __name__ == "__main__":
    main()
