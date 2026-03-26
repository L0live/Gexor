#!/usr/bin/env python3
"""
Gexor — Taxonomy Analyzer
==========================
Analyse le dump P31/P279 pour répondre à :
  1. Quelles sont les grandes familles de types ? (classes avec le plus d'instances)
  2. Combien d'instances couvre chaque racine P279 ?  (propagation bottom-up)
  3. À quoi ressemblent les 73K racines orphelines ?
  4. Quelle est la profondeur moyenne de l'arbre ?
  5. Quelles classes couvrent 80%, 90%, 95% des instances ?

USAGE :
  python analyze_taxonomy.py \
    --classes  wikidata_taxonomy_p31_p279.json \
    --p31      wikidata_taxonomy_p31_p279.json.p31_stream.jsonl

  Le script ne charge que la section "classes" du JSON (pas les edges),
  et streame le JSONL P31 ligne par ligne.
"""

import argparse
import json
import logging
import sys
import time
from collections import defaultdict, Counter
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("taxonomy_analyzer")


# ─────────────────────────────────────────────────────────────────────────────
# 1. Chargement des classes (section "classes" du JSON uniquement)
# ─────────────────────────────────────────────────────────────────────────────

def load_taxonomy(json_path: str) -> tuple:
    """
    Charge le JSON taxonomique complet : sections "classes" et "edges.p31".
    ~370 MB → ~3 GB RAM. C'est un one-shot d'analyse, c'est acceptable.
    Retourne: (classes_dict, p31_edges_list)
    """
    log.info(f"Chargement du JSON taxonomique depuis {json_path}...")
    t0 = time.time()
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    classes = data.get("classes", {})
    p31_edges = data.get("edges", {}).get("p31", [])
    log.info(f"  {len(classes):,} classes + {len(p31_edges):,} edges P31 chargés en {time.time()-t0:.1f}s")
    del data  # libérer la ref au dict racine
    return classes, p31_edges


# ─────────────────────────────────────────────────────────────────────────────
# 2. Comptage direct des instances P31 (stream JSONL)
# ─────────────────────────────────────────────────────────────────────────────

def count_direct_instances(p31_edges: list) -> Counter:
    """
    Compte combien d'instances chaque classe a directement depuis la liste edges.p31.
    Retourne: Counter { class_qid: direct_instance_count }
    """
    log.info(f"Comptage des instances P31 ({len(p31_edges):,} edges)...")
    t0 = time.time()
    counts = Counter()
    for i, record in enumerate(p31_edges):
        cls = record.get("class")
        if cls:
            counts[cls] += 1
        if (i + 1) % 1_000_000 == 0:
            log.info(f"  {i+1:,} edges P31 traités...")
    log.info(f"  {len(p31_edges):,} instances, {len(counts):,} classes distinctes en {time.time()-t0:.1f}s")
    return counts


# ─────────────────────────────────────────────────────────────────────────────
# 3. Propagation bottom-up : chaque classe hérite des instances de ses descendants
# ─────────────────────────────────────────────────────────────────────────────

def propagate_instances_upward(classes: dict, direct_counts: Counter) -> dict:
    """
    Pour chaque classe, calcule le nombre total d'instances en incluant
    toutes les sous-classes (récursivement via P279).

    Algorithme : tri topologique inverse (feuilles d'abord), puis propagation.
    Retourne: { class_qid: { "direct": int, "inherited": int, "total": int } }
    """
    log.info("Propagation bottom-up des instances à travers P279...")
    t0 = time.time()

    # Construire l'adjacence parent → children et child → parents
    children_of = defaultdict(list)
    parent_of = defaultdict(list)
    for qid, node in classes.items():
        for p in node.get("parents", []):
            parent_q = p if isinstance(p, str) else p.get("qid", "")
            if parent_q:
                children_of[parent_q].append(qid)
                parent_of[qid].append(parent_q)

    all_nodes = set(classes.keys())

    # On veut propager des feuilles (nœuds sans children) vers les racines
    # child_degree = nombre de children non encore traités
    child_degree = Counter()
    for qid in all_nodes:
        child_degree[qid] = len(children_of.get(qid, []))

    # Initialiser les compteurs avec les instances directes
    inherited = Counter()
    for qid in all_nodes:
        inherited[qid] = direct_counts.get(qid, 0)

    # File : commencer par les feuilles (0 children)
    queue = [qid for qid in all_nodes if child_degree[qid] == 0]
    visited = set()
    processed = 0

    while queue:
        next_queue = []
        for qid in queue:
            if qid in visited:
                continue
            visited.add(qid)
            processed += 1
            # Propager le total de ce nœud vers tous ses parents
            for parent_q in parent_of[qid]:
                inherited[parent_q] += inherited[qid]
                child_degree[parent_q] -= 1
                if child_degree[parent_q] <= 0 and parent_q not in visited:
                    next_queue.append(parent_q)
        queue = next_queue
        if processed % 100_000 == 0:
            log.info(f"  Propagation: {processed:,}/{len(all_nodes):,} nœuds traités")

    # Nœuds non atteints (ne devrait pas arriver si 0 cycles)
    for qid in all_nodes:
        if qid not in visited:
            inherited[qid] = inherited.get(qid, 0) + direct_counts.get(qid, 0)

    result = {}
    for qid in all_nodes:
        d = direct_counts.get(qid, 0)
        t = inherited.get(qid, 0)
        result[qid] = {
            "direct": d,
            "inherited": t - d,
            "total": t,
        }

    log.info(f"  Propagation terminée en {time.time()-t0:.1f}s, {processed:,} nœuds visités")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# 4. Analyse structurelle de l'arbre
# ─────────────────────────────────────────────────────────────────────────────

def analyze_structure(classes: dict) -> dict:
    """
    Calcule :
      - Racines (pas de parents P279)
      - Feuilles (pas de children P279)
      - Distribution des profondeurs (distance max à une racine)
      - Distribution du nombre de parents / children
    """
    log.info("Analyse structurelle de l'arbre P279...")

    roots = []
    leaves = []
    parent_counts = Counter()
    child_counts = Counter()

    children_of = defaultdict(list)
    for qid, node in classes.items():
        parents = node.get("parents", [])
        children = node.get("children", [])
        np = len(parents)
        nc = len(children)
        parent_counts[np] += 1
        child_counts[nc] += 1
        if np == 0:
            roots.append(qid)
        if nc == 0:
            leaves.append(qid)
        for p in parents:
            parent_q = p if isinstance(p, str) else p.get("qid", "")
            if parent_q:
                children_of[parent_q].append(qid)

    # Calcul des profondeurs (BFS depuis les racines)
    log.info(f"  BFS depuis {len(roots):,} racines pour calculer les profondeurs...")
    depth = {}

    queue = [(r, 0) for r in roots]
    while queue:
        next_queue = []
        for qid, d in queue:
            if qid in depth:
                continue
            depth[qid] = d
            for child in children_of.get(qid, []):
                if child not in depth:
                    next_queue.append((child, d + 1))
        queue = next_queue

    depth_distribution = Counter(depth.values())

    return {
        "roots": roots,
        "root_count": len(roots),
        "leaves": leaves,
        "leaf_count": len(leaves),
        "parent_count_distribution": dict(sorted(parent_counts.items())),
        "child_count_distribution": dict(sorted(child_counts.items())[:20]),
        "depth_distribution": dict(sorted(depth_distribution.items())),
        "max_depth": max(depth.values()) if depth else 0,
        "avg_depth": sum(depth.values()) / len(depth) if depth else 0,
        "unreached_by_bfs": len(classes) - len(depth),
    }


# ─────────────────────────────────────────────────────────────────────────────
# 5. Rapport final
# ─────────────────────────────────────────────────────────────────────────────

def generate_report(
    classes: dict,
    direct_counts: Counter,
    propagated: dict,
    structure: dict,
    output_path: str,
):
    log.info("Génération du rapport...")
    total_instances = sum(direct_counts.values())

    # ── TOP classes par instances DIRECTES ─────────────────────────────────
    top_direct = direct_counts.most_common(100)

    # ── TOP classes par instances TOTALES (propagées) ──────────────────────
    top_total = sorted(
        propagated.items(),
        key=lambda x: x[1]["total"],
        reverse=True,
    )[:100]

    # ── Couverture cumulative : combien de classes pour couvrir X% ? ──────
    sorted_by_direct = sorted(direct_counts.items(), key=lambda x: x[1], reverse=True)
    cumulative = 0
    coverage_thresholds = {50: None, 80: None, 90: None, 95: None, 99: None}
    for i, (qid, count) in enumerate(sorted_by_direct):
        cumulative += count
        pct = (cumulative / total_instances * 100) if total_instances > 0 else 0
        for threshold in coverage_thresholds:
            if coverage_thresholds[threshold] is None and pct >= threshold:
                coverage_thresholds[threshold] = {
                    "classes_needed": i + 1,
                    "instances_covered": cumulative,
                    "percentage": round(pct, 2),
                }

    # ── Racines : les plus grosses vs les orphelines ──────────────────────
    root_qids = structure["roots"]
    roots_with_instances = []
    roots_without_instances = []
    for qid in root_qids:
        t = propagated.get(qid, {}).get("total", 0)
        label = classes.get(qid, {}).get("label", qid)
        nc = len(classes.get(qid, {}).get("children", []))
        entry = {"qid": qid, "label": label, "total_instances": t, "direct_children": nc}
        if t > 0:
            roots_with_instances.append(entry)
        else:
            roots_without_instances.append(entry)

    roots_with_instances.sort(key=lambda x: x["total_instances"], reverse=True)
    roots_without_instances.sort(key=lambda x: x["direct_children"], reverse=True)

    # ── Classes sans aucune instance (ni directe ni héritée) ──────────────
    empty_classes = [qid for qid, d in propagated.items() if d["total"] == 0]

    # ── Build report ──────────────────────────────────────────────────────
    report = {
        "_description": "Analyse du dump taxonomique Wikidata P31/P279 pour Gexor",
        "_generated": time.strftime("%Y-%m-%d %H:%M:%S"),

        "summary": {
            "total_classes": len(classes),
            "total_p31_instances": total_instances,
            "unique_instance_classes": len(direct_counts),
            "classes_with_zero_instances": len(empty_classes),
            "root_count": structure["root_count"],
            "leaf_count": structure["leaf_count"],
            "max_depth": structure["max_depth"],
            "avg_depth": round(structure["avg_depth"], 2),
        },

        "coverage_analysis": {
            "_description": "Combien de classes (triées par instances directes) faut-il pour couvrir X% des instances ?",
            "thresholds": coverage_thresholds,
        },

        "top_50_classes_by_direct_instances": [
            {
                "rank": i + 1,
                "qid": qid,
                "label": classes.get(qid, {}).get("label", qid),
                "direct_instances": count,
                "pct_of_total": round(count / total_instances * 100, 3) if total_instances else 0,
            }
            for i, (qid, count) in enumerate(top_direct[:50])
        ],

        "top_50_classes_by_total_instances_propagated": [
            {
                "rank": i + 1,
                "qid": qid,
                "label": classes.get(qid, {}).get("label", qid),
                "direct": data["direct"],
                "inherited": data["inherited"],
                "total": data["total"],
                "pct_of_total": round(data["total"] / total_instances * 100, 3) if total_instances else 0,
            }
            for i, (qid, data) in enumerate(top_total[:50])
        ],

        "depth_distribution": structure["depth_distribution"],
        "parent_count_distribution": structure["parent_count_distribution"],

        "roots_analysis": {
            "total_roots": len(root_qids),
            "roots_with_instances": len(roots_with_instances),
            "roots_without_instances": len(roots_without_instances),
            "top_30_roots_by_coverage": roots_with_instances[:30],
            "sample_orphan_roots_no_instances": roots_without_instances[:50],
            "sample_orphan_roots_with_children_but_no_instances": [
                r for r in roots_without_instances if r["direct_children"] > 0
            ][:30],
        },

        "empty_classes_sample": {
            "total": len(empty_classes),
            "sample": [
                {
                    "qid": qid,
                    "label": classes.get(qid, {}).get("label", qid),
                    "parents": len(classes.get(qid, {}).get("parents", [])),
                    "children": len(classes.get(qid, {}).get("children", [])),
                }
                for qid in empty_classes[:50]
            ],
        },
    }

    # ── Écriture ──────────────────────────────────────────────────────────
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    size_mb = Path(output_path).stat().st_size / 1024 / 1024
    log.info(f"✓ Rapport écrit : {output_path} ({size_mb:.1f} MB)")

    # ── Résumé console ────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("RÉSUMÉ TAXONOMIE WIKIDATA")
    print("=" * 70)
    print(f"  Classes totales      : {len(classes):>12,}")
    print(f"  Instances P31        : {total_instances:>12,}")
    print(f"  Racines P279         : {structure['root_count']:>12,}")
    print(f"  Feuilles P279        : {structure['leaf_count']:>12,}")
    print(f"  Profondeur max       : {structure['max_depth']:>12}")
    print(f"  Profondeur moyenne   : {structure['avg_depth']:>12.1f}")
    print(f"  Classes sans instance: {len(empty_classes):>12,}")

    print(f"\n── COUVERTURE ──────────────────────────────────────────────")
    for pct, info in sorted(coverage_thresholds.items()):
        if info:
            print(f"  {pct}% des instances = {info['classes_needed']:,} classes")

    print(f"\n── TOP 20 CLASSES (instances directes) ─────────────────────")
    for i, (qid, count) in enumerate(top_direct[:20]):
        label = classes.get(qid, {}).get("label", qid)
        pct = count / total_instances * 100 if total_instances else 0
        print(f"  {i+1:>3}. {qid:<12} {count:>10,}  ({pct:>5.1f}%)  {label}")

    print(f"\n── TOP 20 CLASSES (total propagé via P279) ─────────────────")
    for i, (qid, data) in enumerate(top_total[:20]):
        label = classes.get(qid, {}).get("label", qid)
        pct = data['total'] / total_instances * 100 if total_instances else 0
        print(f"  {i+1:>3}. {qid:<12} {data['total']:>10,}  ({pct:>5.1f}%)  {label}")

    print(f"\n── TOP 15 RACINES (par instances totales) ──────────────────")
    for i, r in enumerate(roots_with_instances[:15]):
        print(f"  {i+1:>3}. {r['qid']:<12} {r['total_instances']:>10,}  children={r['direct_children']:<5}  {r['label']}")

    print(f"\n── ÉCHANTILLON RACINES ORPHELINES (0 instances) ────────────")
    for r in roots_without_instances[:15]:
        print(f"       {r['qid']:<12} children={r['direct_children']:<5}  {r['label']}")

    print(f"\n── PROFONDEUR P279 ─────────────────────────────────────────")
    for depth_val in sorted(structure["depth_distribution"].keys()):
        count = structure["depth_distribution"][depth_val]
        bar = "█" * min(50, int(count / max(structure["depth_distribution"].values()) * 50))
        print(f"  depth {depth_val:>2} : {count:>8,}  {bar}")

    print("=" * 70)


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Analyse du dump taxonomique Wikidata")
    parser.add_argument(
        "--taxonomy", required=True,
        help="Chemin vers le JSON taxonomique complet (wikidata_taxonomy_p31_p279.json)",
    )
    parser.add_argument(
        "--output", default="taxonomy_analysis_report.json",
        help="Fichier de sortie du rapport (défaut: taxonomy_analysis_report.json)",
    )
    args = parser.parse_args()

    t0 = time.time()

    # 1. Charger classes + edges P31 depuis le JSON
    classes, p31_edges = load_taxonomy(args.taxonomy)

    # 2. Compter les instances directes
    direct_counts = count_direct_instances(p31_edges)
    del p31_edges  # libérer ~300 MB

    # 3. Propager les instances vers les ancêtres P279
    propagated = propagate_instances_upward(classes, direct_counts)

    # 4. Analyse structurelle
    structure = analyze_structure(classes)

    # 5. Générer le rapport
    generate_report(classes, direct_counts, propagated, structure, args.output)

    elapsed = time.time() - t0
    log.info(f"Analyse terminée en {elapsed:.1f}s")


if __name__ == "__main__":
    main()
