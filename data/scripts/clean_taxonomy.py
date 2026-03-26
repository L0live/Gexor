#!/usr/bin/env python3
# filepath: /home/lolive/Git/Gexor/data/clean_taxonomy.py
"""
Gexor — Taxonomy Cleaner
=========================
Nettoie la taxonomie P31/P279 extraite par wikidata_full_taxonomy.py.

Stratégie :
  1. Garder toute classe avec ≥ min_instances instances directes
  2. Garder tout ancêtre P279 d'une classe gardée (nœuds intermédiaires)
  3. Supprimer les classes Wikimedia noise (catégories, templates, disambiguation…)
  4. Élaguer les feuilles sans instances et sans descendant utile
  5. Recalculer instanceCount propagé (direct + hérité via P279)
  6. Récupérer les labels depuis le fichier d'entrée (produit par wikidata_full_taxonomy.py)
  7. Produire un JSON stratifié : version complète + version légère (top N classes)

USAGE :
  # Nettoyage basique
  python clean_taxonomy.py --input taxonomy_p31_p279.json

  # Version légère seulement (top 10K classes)
  python clean_taxonomy.py --input taxonomy_p31_p279.json --light-only --light-top 10000

SORTIE :
  taxonomy_clean.json       — version complète nettoyée
  taxonomy_light.json       — top N classes (pour le frontend)
  taxonomy_clean_report.json — rapport de nettoyage
"""

import argparse
import json
import logging
import os
import sys
import time
from collections import deque
from pathlib import Path
from typing import Optional

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
log = logging.getLogger("gexor.cleantax")

# ─────────────────────────────────────────────────────────────────────────────
# Wikimedia noise QIDs — types internes à exclure
# ─────────────────────────────────────────────────────────────────────────────

# Ces QIDs et tous leurs descendants P279 sont du bruit Wikimedia
WIKIMEDIA_NOISE_ROOTS = {
    "Q4167836",   # Wikimedia category
    "Q4167410",   # Wikimedia disambiguation page
    "Q11266439",  # Wikimedia template
    "Q13406463",  # Wikimedia list article
    "Q17442446",  # Wikimedia internal item
    "Q13442814",  # scholarly article (3.1M instances — bruit pour l'exploration)
    "Q17633526",  # Wikinews article
    "Q4663903",   # Wikimedia portal
    "Q15184295",  # Wikimedia module
    "Q19842659",  # Wikimedia user language template
    "Q21528878",  # Wikimedia project page
    "Q58494026",  # Wikimedia content page outside main namespaces
    "Q59259627",  # Wikimedia redirect page in project namespace
}

# ─────────────────────────────────────────────────────────────────────────────
# Labels from input file
# ─────────────────────────────────────────────────────────────────────────────

def extract_labels_from_input(classes: dict, useful: set[str]) -> dict[str, dict[str, str]]:
    """
    Extract labels from the input taxonomy (produced by wikidata_full_taxonomy.py).
    Supports both formats:
      - "labels": {"en": "...", "fr": "..."}  (--all-labels)
      - "label": "..."                         (--lang XX, stored as {"xx": "..."})
    Returns { qid: { lang: label, ... } } for QIDs in useful set.
    """
    labels: dict[str, dict[str, str]] = {}
    for qid in useful:
        node = classes.get(qid, {})
        if "labels" in node and isinstance(node["labels"], dict):
            labels[qid] = node["labels"]
        elif "label" in node and isinstance(node["label"], str) and node["label"] != qid:
            # Single-lang label — we don't know the exact lang, store as-is
            labels[qid] = {"label": node["label"]}
    resolved = len(labels)
    total = len(useful)
    log.info(f"Labels extracted from input: {resolved:,}/{total:,}")
    return labels if labels else None


# ─────────────────────────────────────────────────────────────────────────────
# Loading
# ─────────────────────────────────────────────────────────────────────────────

def load_taxonomy(path: str) -> dict:
    """Load the raw taxonomy JSON produced by wikidata_full_taxonomy.py."""
    log.info(f"Loading taxonomy from {path}...")
    size_mb = os.path.getsize(path) / 1024 / 1024
    log.info(f"  File size: {size_mb:.1f} MB")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    classes = data.get("classes", {})
    log.info(f"  Loaded {len(classes):,} classes")
    return data


# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Count direct instances per class from P31 edges
# ─────────────────────────────────────────────────────────────────────────────

def count_direct_instances(data: dict) -> dict[str, int]:
    """
    Count direct P31 instances per class.
    Reads from edges.p31 or from a .p31_stream.jsonl sidecar file.
    """
    log.info("Counting direct instances per class...")
    counts: dict[str, int] = {}

    # Try edges.p31 in the JSON
    p31_edges = data.get("edges", {}).get("p31", [])
    if p31_edges:
        log.info(f"  Using {len(p31_edges):,} P31 edges from JSON")
        for edge in p31_edges:
            cls = edge.get("class", "")
            if cls:
                counts[cls] = counts.get(cls, 0) + 1
    else:
        # Try the p31_stream sidecar
        log.info("  No P31 edges in JSON, looking for .p31_stream.jsonl sidecar...")
        # Check common paths
        for suffix in [".p31_stream.jsonl", "_p31_stream.jsonl"]:
            sidecar = data.get("meta", {}).get("p31_stream_path", "")
            if not sidecar:
                # Try to find it next to the input file
                pass
            if sidecar and os.path.exists(sidecar):
                log.info(f"  Reading P31 stream from {sidecar}")
                line_count = 0
                with open(sidecar, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            edge = json_loads(line)
                            cls = edge.get("class", "")
                            if cls:
                                counts[cls] = counts.get(cls, 0) + 1
                            line_count += 1
                        except Exception:
                            continue
                log.info(f"  Read {line_count:,} P31 edges from sidecar")
                break

    # Also count from classes if they have instanceCount already
    if not counts:
        log.info("  No P31 edges found, using classes data for instance counts...")
        classes = data.get("classes", {})
        for qid, node in classes.items():
            # Some taxonomy formats store instance count directly
            ic = node.get("instanceCount", node.get("instance_count", 0))
            if ic > 0:
                counts[qid] = ic

    log.info(f"  Classes with ≥1 instance: {len(counts):,}")
    total_instances = sum(counts.values())
    log.info(f"  Total P31 instance edges: {total_instances:,}")
    return counts


# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Identify Wikimedia noise subtrees
# ─────────────────────────────────────────────────────────────────────────────

def find_noise_subtree(classes: dict, noise_roots: set[str]) -> set[str]:
    """
    BFS downward from noise roots to find ALL descendants to exclude.
    Returns set of QIDs to remove.
    """
    log.info(f"Finding Wikimedia noise subtrees from {len(noise_roots)} roots...")

    # Build parent→children index
    children_index: dict[str, list[str]] = {}
    for qid, node in classes.items():
        for parent_edge in node.get("parents", []):
            parent_qid = parent_edge if isinstance(parent_edge, str) else parent_edge.get("qid", "")
            if parent_qid:
                if parent_qid not in children_index:
                    children_index[parent_qid] = []
                children_index[parent_qid].append(qid)

    # Also use the "children" field if present
    for qid, node in classes.items():
        for child_edge in node.get("children", []):
            child_qid = child_edge if isinstance(child_edge, str) else child_edge.get("qid", "")
            if child_qid:
                if qid not in children_index:
                    children_index[qid] = []
                if child_qid not in children_index[qid]:
                    children_index[qid].append(child_qid)

    # BFS from noise roots
    noise_set: set[str] = set()
    queue = deque()
    for root in noise_roots:
        if root in classes or root in children_index:
            queue.append(root)
            noise_set.add(root)

    while queue:
        current = queue.popleft()
        for child in children_index.get(current, []):
            if child not in noise_set:
                noise_set.add(child)
                queue.append(child)

    log.info(f"  Noise subtree: {len(noise_set):,} classes to remove")
    # Log which roots were found
    for root in noise_roots:
        count = sum(1 for q in noise_set if q == root)
        if root in noise_set:
            desc = len([c for c in children_index.get(root, [])])
            log.info(f"    {root}: found, {desc} direct children")
    return noise_set


# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Mark useful classes (instances ≥ threshold + ancestors)
# ─────────────────────────────────────────────────────────────────────────────

def find_useful_classes(
    classes: dict,
    instance_counts: dict[str, int],
    noise_set: set[str],
    min_instances: int,
) -> set[str]:
    """
    Find all classes to keep:
    1. Classes with ≥ min_instances direct instances (that aren't noise)
    2. All ancestors (P279 upward) of those classes (intermediate taxonomy nodes)
    """
    log.info(f"Finding useful classes (min_instances={min_instances})...")

    # Step A: seed classes with enough instances
    seed: set[str] = set()
    for qid, count in instance_counts.items():
        if count >= min_instances and qid not in noise_set:
            seed.add(qid)
    log.info(f"  Seed classes (≥{min_instances} instances, not noise): {len(seed):,}")

    # Step B: walk P279 upward to mark all ancestors
    useful: set[str] = set(seed)
    queue = deque(seed)

    while queue:
        current = queue.popleft()
        node = classes.get(current, {})
        for parent_edge in node.get("parents", []):
            parent_qid = parent_edge if isinstance(parent_edge, str) else parent_edge.get("qid", "")
            if parent_qid and parent_qid not in useful and parent_qid not in noise_set:
                useful.add(parent_qid)
                queue.append(parent_qid)

    log.info(f"  Useful classes (seed + ancestors): {len(useful):,}")
    return useful


# ─────────────────────────────────────────────────────────────────────────────
# Step 4: Propagate instance counts (direct + inherited via P279)
# ─────────────────────────────────────────────────────────────────────────────

def propagate_instance_counts(
    classes: dict,
    useful: set[str],
    instance_counts: dict[str, int],
) -> dict[str, int]:
    """
    Bottom-up propagation: each class gets its direct instances + sum of all
    descendants' direct instances (via P279 edges).

    Uses reverse topological order (leaves first).
    """
    log.info("Propagating instance counts bottom-up...")

    # Build adjacency (child→parents) restricted to useful classes
    child_to_parents: dict[str, list[str]] = {}
    parent_to_children: dict[str, list[str]] = {}

    for qid in useful:
        node = classes.get(qid, {})
        for parent_edge in node.get("parents", []):
            parent_qid = parent_edge if isinstance(parent_edge, str) else parent_edge.get("qid", "")
            if parent_qid in useful:
                if qid not in child_to_parents:
                    child_to_parents[qid] = []
                child_to_parents[qid].append(parent_qid)
                if parent_qid not in parent_to_children:
                    parent_to_children[parent_qid] = []
                parent_to_children[parent_qid].append(qid)

    # Kahn's algorithm for topological order (children before parents)
    in_degree: dict[str, int] = {q: 0 for q in useful}
    for qid, parents in child_to_parents.items():
        for p in parents:
            in_degree[p] = in_degree.get(p, 0) + 1  # parent depends on child being processed first

    # Actually, we want leaves first. A "leaf" has no children.
    # in_degree here = number of children a node has
    in_degree_children: dict[str, int] = {q: len(parent_to_children.get(q, [])) for q in useful}

    queue = deque([q for q in useful if in_degree_children[q] == 0])
    propagated: dict[str, int] = {}
    processed = 0

    while queue:
        current = queue.popleft()
        processed += 1

        # This node's total = its direct + sum of children's totals
        direct = instance_counts.get(current, 0)
        children_total = sum(
            propagated.get(child, 0)
            for child in parent_to_children.get(current, [])
        )
        propagated[current] = direct + children_total

        # Decrement in-degree for parents
        for parent in child_to_parents.get(current, []):
            in_degree_children[parent] -= 1
            if in_degree_children[parent] == 0:
                queue.append(parent)

    # Handle any remaining (cycles)
    unprocessed = useful - {q for q in propagated}
    if unprocessed:
        log.warning(f"  {len(unprocessed)} classes in cycles, using direct count only")
        for q in unprocessed:
            propagated[q] = instance_counts.get(q, 0)

    log.info(f"  Propagated counts for {len(propagated):,} classes")
    return propagated


# ─────────────────────────────────────────────────────────────────────────────
# Step 5: Compute depth for each class
# ─────────────────────────────────────────────────────────────────────────────

def compute_depths(classes: dict, useful: set[str]) -> dict[str, int]:
    """
    BFS top-down from roots to compute depth.
    Roots (no parents in useful set) have depth 0.
    """
    log.info("Computing class depths...")

    parent_to_children: dict[str, list[str]] = {}
    has_parent: set[str] = set()

    for qid in useful:
        node = classes.get(qid, {})
        for parent_edge in node.get("parents", []):
            parent_qid = parent_edge if isinstance(parent_edge, str) else parent_edge.get("qid", "")
            if parent_qid in useful:
                has_parent.add(qid)
                if parent_qid not in parent_to_children:
                    parent_to_children[parent_qid] = []
                parent_to_children[parent_qid].append(qid)

    roots = useful - has_parent
    log.info(f"  Roots: {len(roots):,}")

    depths: dict[str, int] = {}
    queue = deque()
    for r in roots:
        depths[r] = 0
        queue.append(r)

    while queue:
        current = queue.popleft()
        d = depths[current]
        for child in parent_to_children.get(current, []):
            if child not in depths or depths[child] > d + 1:
                depths[child] = d + 1
                queue.append(child)

    # Any remaining (disconnected in useful set)
    for q in useful:
        if q not in depths:
            depths[q] = 0

    max_depth = max(depths.values()) if depths else 0
    log.info(f"  Max depth: {max_depth}")
    return depths


# ─────────────────────────────────────────────────────────────────────────────
# Step 6: Build clean output
# ─────────────────────────────────────────────────────────────────────────────

def build_clean_taxonomy(
    classes: dict,
    useful: set[str],
    instance_counts: dict[str, int],
    propagated_counts: dict[str, int],
    depths: dict[str, int],
    labels: Optional[dict[str, dict[str, str]]],
) -> dict:
    """Build the cleaned taxonomy dict."""
    log.info("Building clean taxonomy...")

    clean_classes: dict = {}

    for qid in useful:
        node = classes.get(qid, {})

        # Parents (only those in useful set)
        parents = []
        for parent_edge in node.get("parents", []):
            parent_qid = parent_edge if isinstance(parent_edge, str) else parent_edge.get("qid", "")
            if parent_qid in useful:
                parents.append(parent_qid)

        # Children (only those in useful set)
        children = []
        for child_edge in node.get("children", []):
            child_qid = child_edge if isinstance(child_edge, str) else child_edge.get("qid", "")
            if child_qid in useful:
                children.append(child_qid)

        # Also find children via reverse parent lookup
        # (some formats only store parents, not children)
        # We already did this in propagation, but let's be safe
        for other_qid in useful:
            if other_qid == qid:
                continue
            other_node = classes.get(other_qid, {})
            for pe in other_node.get("parents", []):
                pq = pe if isinstance(pe, str) else pe.get("qid", "")
                if pq == qid and other_qid not in children:
                    children.append(other_qid)

        entry: dict = {
            "parents": parents,
            "children": children,
            "directInstances": instance_counts.get(qid, 0),
            "totalInstances": propagated_counts.get(qid, 0),
            "depth": depths.get(qid, 0),
        }

        # Labels (all languages if available)
        if labels and qid in labels:
            entry["labels"] = labels[qid]

        clean_classes[qid] = entry

    log.info(f"  Clean classes: {len(clean_classes):,}")
    return clean_classes


def build_children_index(classes: dict, useful: set[str]) -> dict[str, list[str]]:
    """
    Build a children index efficiently by iterating once over all useful classes
    and looking at their parents. Much faster than the O(N²) approach in
    build_clean_taxonomy.
    """
    log.info("Building children index...")
    children_idx: dict[str, list[str]] = {}

    for qid in useful:
        node = classes.get(qid, {})
        for parent_edge in node.get("parents", []):
            parent_qid = parent_edge if isinstance(parent_edge, str) else parent_edge.get("qid", "")
            if parent_qid in useful:
                if parent_qid not in children_idx:
                    children_idx[parent_qid] = []
                children_idx[parent_qid].append(qid)

    # Also include explicit children from the source data
    for qid in useful:
        node = classes.get(qid, {})
        for child_edge in node.get("children", []):
            child_qid = child_edge if isinstance(child_edge, str) else child_edge.get("qid", "")
            if child_qid in useful:
                if qid not in children_idx:
                    children_idx[qid] = []
                if child_qid not in children_idx[qid]:
                    children_idx[qid].append(child_qid)

    log.info(f"  Children index: {len(children_idx):,} parents with children")
    return children_idx


def build_clean_taxonomy_fast(
    classes: dict,
    useful: set[str],
    instance_counts: dict[str, int],
    propagated_counts: dict[str, int],
    depths: dict[str, int],
    labels: Optional[dict[str, dict[str, str]]],
) -> dict:
    """Build the cleaned taxonomy dict — O(N) version."""
    log.info("Building clean taxonomy (fast)...")

    children_idx = build_children_index(classes, useful)
    clean_classes: dict = {}

    for qid in useful:
        node = classes.get(qid, {})

        # Parents (only those in useful set)
        parents = []
        for parent_edge in node.get("parents", []):
            parent_qid = parent_edge if isinstance(parent_edge, str) else parent_edge.get("qid", "")
            if parent_qid in useful:
                parents.append(parent_qid)

        children = children_idx.get(qid, [])

        entry: dict = {
            "parents": parents,
            "children": children,
            "directInstances": instance_counts.get(qid, 0),
            "totalInstances": propagated_counts.get(qid, 0),
            "depth": depths.get(qid, 0),
        }

        if labels and qid in labels:
            entry["labels"] = labels[qid]

        clean_classes[qid] = entry

    log.info(f"  Clean classes: {len(clean_classes):,}")
    return clean_classes


# ─────────────────────────────────────────────────────────────────────────────
# Step 7: Stratified output (light version)
# ─────────────────────────────────────────────────────────────────────────────

def build_light_taxonomy(
    clean_classes: dict,
    top_n: int,
) -> dict:
    """
    Extract top N classes by totalInstances + their ancestors.
    This produces a small file loadable by the frontend.
    """
    log.info(f"Building light taxonomy (top {top_n})...")

    # Sort by totalInstances desc
    sorted_qids = sorted(
        clean_classes.keys(),
        key=lambda q: clean_classes[q]["totalInstances"],
        reverse=True,
    )

    # Take top N
    top_set = set(sorted_qids[:top_n])

    # Add all ancestors of top classes
    queue = deque(top_set)
    full_set = set(top_set)
    while queue:
        current = queue.popleft()
        node = clean_classes.get(current, {})
        for parent in node.get("parents", []):
            if parent in clean_classes and parent not in full_set:
                full_set.add(parent)
                queue.append(parent)

    log.info(f"  Top {top_n} + ancestors = {len(full_set):,} classes")

    # Build light dict — restrict children to those in full_set
    light: dict = {}
    for qid in full_set:
        node = clean_classes[qid]
        light[qid] = {
            "parents": [p for p in node["parents"] if p in full_set],
            "children": [c for c in node["children"] if c in full_set],
            "directInstances": node["directInstances"],
            "totalInstances": node["totalInstances"],
            "depth": node["depth"],
        }
        if "labels" in node:
            light[qid]["labels"] = node["labels"]

    return light


# ─────────────────────────────────────────────────────────────────────────────
# Output
# ─────────────────────────────────────────────────────────────────────────────

def write_output(path: str, meta: dict, classes: dict, indent: int = 2):
    """Write JSON output with streaming for large files."""
    log.info(f"Writing {len(classes):,} classes to {path}...")

    output = {
        "meta": meta,
        "classes": classes,
    }

    with open(path, "w", encoding="utf-8") as f:
        f.write(json_dumps(output, indent=indent))

    size_mb = os.path.getsize(path) / 1024 / 1024
    log.info(f"  ✓ Written {size_mb:.1f} MB → {path}")


def write_report(path: str, report: dict):
    """Write the cleaning report."""
    with open(path, "w", encoding="utf-8") as f:
        f.write(json_dumps(report, indent=2))
    log.info(f"  ✓ Report → {path}")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Gexor — Clean and stratify Wikidata P31/P279 taxonomy",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="Path to raw taxonomy JSON (from wikidata_full_taxonomy.py)",
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Output path for clean taxonomy (default: <input_dir>/taxonomy_clean.json)",
    )
    parser.add_argument(
        "--output-light",
        default=None,
        help="Output path for light taxonomy (default: <input_dir>/taxonomy_light.json)",
    )
    parser.add_argument(
        "--min-instances",
        type=int,
        default=1,
        help="Minimum direct instances to keep a class (default: 1)",
    )
    parser.add_argument(
        "--light-top",
        type=int,
        default=10000,
        help="Number of top classes for light version (default: 10000)",
    )
    parser.add_argument(
        "--light-only",
        action="store_true",
        help="Only produce the light version",
    )
    parser.add_argument(
        "--no-labels",
        action="store_true",
        help="Ne pas inclure les labels dans la sortie (même si présents dans l'entrée)",
    )
    parser.add_argument(
        "--keep-scholarly",
        action="store_true",
        help="Don't remove Q13442814 (scholarly article) from noise list",
    )
    parser.add_argument(
        "--p31-stream",
        default=None,
        help="Path to P31 stream JSONL file (if separate from main JSON)",
    )
    parser.add_argument(
        "--no-propagation",
        action="store_true",
        help="Skip bottom-up instance count propagation (faster, less accurate)",
    )

    args = parser.parse_args()

    input_path = args.input
    input_dir = str(Path(input_path).parent)

    output_path = args.output or os.path.join(input_dir, "taxonomy_clean.json")
    output_light_path = args.output_light or os.path.join(input_dir, "taxonomy_light.json")
    report_path = os.path.join(input_dir, "taxonomy_clean_report.json")

    # Load
    t0 = time.time()
    data = load_taxonomy(input_path)
    classes = data.get("classes", {})

    # Handle P31 stream sidecar
    if args.p31_stream:
        data["meta"] = data.get("meta", {})
        data["meta"]["p31_stream_path"] = args.p31_stream

    # Noise set
    noise_roots = set(WIKIMEDIA_NOISE_ROOTS)
    if args.keep_scholarly:
        noise_roots.discard("Q13442814")
        log.info("Keeping Q13442814 (scholarly article)")

    # Step 1: count instances
    instance_counts = count_direct_instances(data)

    # Step 2: find noise
    noise_set = find_noise_subtree(classes, noise_roots)

    # Step 3: find useful classes
    useful = find_useful_classes(classes, instance_counts, noise_set, args.min_instances)

    # Step 4: propagate counts
    if args.no_propagation:
        propagated = {q: instance_counts.get(q, 0) for q in useful}
        log.info("Skipping propagation (--no-propagation)")
    else:
        propagated = propagate_instance_counts(classes, useful, instance_counts)

    # Step 5: compute depths
    depths = compute_depths(classes, useful)

    # Step 6: labels (from input file)
    labels = None
    if not args.no_labels:
        labels = extract_labels_from_input(classes, useful)

    # Step 7: build clean
    clean_classes = build_clean_taxonomy_fast(
        classes, useful, instance_counts, propagated, depths, labels
    )

    # Meta
    meta = {
        "version": "1.0",
        "source": os.path.basename(input_path),
        "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "totalClasses": len(clean_classes),
        "minInstances": args.min_instances,
        "noiseRemoved": len(noise_set),
        "hasLabels": labels is not None and len(labels) > 0,
    }

    # Write full version
    if not args.light_only:
        write_output(output_path, meta, clean_classes)

    # Write light version
    light_classes = build_light_taxonomy(clean_classes, args.light_top)
    light_meta = {
        **meta,
        "variant": "light",
        "topN": args.light_top,
        "totalClasses": len(light_classes),
    }
    write_output(output_light_path, light_meta, light_classes)

    # Report
    elapsed = time.time() - t0

    # Distribution stats
    depth_dist = {}
    for q in clean_classes:
        d = clean_classes[q]["depth"]
        depth_dist[d] = depth_dist.get(d, 0) + 1

    instance_dist = {"0": 0, "1-10": 0, "11-100": 0, "101-1000": 0, "1001-10000": 0, "10000+": 0}
    for q in clean_classes:
        ic = clean_classes[q]["directInstances"]
        if ic == 0:
            instance_dist["0"] += 1
        elif ic <= 10:
            instance_dist["1-10"] += 1
        elif ic <= 100:
            instance_dist["11-100"] += 1
        elif ic <= 1000:
            instance_dist["101-1000"] += 1
        elif ic <= 10000:
            instance_dist["1001-10000"] += 1
        else:
            instance_dist["10000+"] += 1

    report = {
        "elapsed_seconds": round(elapsed, 1),
        "input": {
            "total_classes": len(classes),
            "file": os.path.basename(input_path),
        },
        "cleaning": {
            "noise_removed": len(noise_set),
            "noise_roots": sorted(noise_roots),
            "min_instances": args.min_instances,
            "seed_classes": len([q for q in instance_counts if instance_counts[q] >= args.min_instances and q not in noise_set]),
            "ancestors_added": len(useful) - len([q for q in instance_counts if instance_counts[q] >= args.min_instances and q not in noise_set]),
        },
        "output": {
            "clean_classes": len(clean_classes),
            "light_classes": len(light_classes),
            "labels_resolved": len(labels) if labels else 0,
            "reduction_pct": round((1 - len(clean_classes) / max(len(classes), 1)) * 100, 1),
        },
        "distribution": {
            "depth": {str(k): v for k, v in sorted(depth_dist.items())},
            "instance_ranges": instance_dist,
        },
        "top_20_by_total": sorted(
            [
                {"qid": q, "totalInstances": clean_classes[q]["totalInstances"],
                 "directInstances": clean_classes[q]["directInstances"]}
                for q in clean_classes
            ],
            key=lambda x: x["totalInstances"],
            reverse=True,
        )[:20],
    }

    write_report(report_path, report)

    log.info(f"")
    log.info(f"{'='*60}")
    log.info(f"  DONE in {elapsed:.1f}s")
    log.info(f"  Input:  {len(classes):>10,} classes")
    log.info(f"  Noise:  {len(noise_set):>10,} removed")
    log.info(f"  Output: {len(clean_classes):>10,} classes ({report['output']['reduction_pct']}% reduction)")
    log.info(f"  Light:  {len(light_classes):>10,} classes")
    log.info(f"{'='*60}")


if __name__ == "__main__":
    main()