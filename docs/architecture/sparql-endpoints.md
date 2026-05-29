# SPARQL Endpoints Publics — Liste Exhaustive

> **Mis à jour : Février 2025**  
> Sources : W3C Wiki, Wikidata Federation Allowlist, LOD Cloud, CIDOC-CRM, recherches directes.  
> ⚠️ = Endpoint parfois instable ou en maintenance. ❌ = Officiellement arrêté, conservé pour référence historique.

---

## 🔗 Identifiants Communs Inter-Endpoints

Ces propriétés/identifiants permettent de **chaîner les endpoints** via des requêtes fédérées (`SERVICE`).

| Identifiant | Wikidata Property | Description |
|---|---|---|
| **VIAF ID** | `P214` | Virtual International Authority File — lien universel entre personnes/auteurs |
| **GeoNames ID** | `P1566` | Identifiant géographique universel |
| **ISNI** | `P213` | International Standard Name Identifier |
| **ORCID** | `P496` | Identifiant chercheurs/auteurs scientifiques |
| **DOI** | `P356` | Digital Object Identifier — publications |
| **ISBN** | `P212` / `P957` | Livres |
| **ISSN** | `P236` | Périodiques et revues |
| **MusicBrainz Artist ID** | `P434` | Artistes musicaux |
| **MusicBrainz Work ID** | `P435` | Œuvres musicales |
| **MBID** | — | MusicBrainz ID (artistes, albums, pistes) |
| **Getty ULAN ID** | `P245` | Union List of Artist Names |
| **Getty TGN ID** | `P1667` | Thesaurus of Geographic Names |
| **Getty AAT ID** | `P1014` | Art & Architecture Thesaurus |
| **BnF ID** | `P268` | Bibliothèque nationale de France |
| **Library of Congress ID** | `P244` | LoC Name Authority File |
| **GND ID** | `P227` | Gemeinsame Normdatei (Allemagne) |
| **RKD Artists ID** | `P650` | Netherlands Institute for Art History |
| **Europeana ID** | `P7704` | Identifiant Europeana |
| **OpenCitations OMID** | — | OpenCitations Meta ID |
| **UniProt ID** | `P352` | Protéines |
| **Ensembl Gene ID** | `P594` | Gènes |
| **ChEMBL ID** | `P592` | Composés chimiques |
| **PubMed ID / PMID** | `P698` | Articles biomédicaux |
| **Orphanet ID** | `P1550` | Maladies rares |
| **INaturalist taxon ID** | `P3151` | Taxons biologiques |
| **NCBI Taxonomy ID** | `P685` | Taxonomie biologique |
| **Japan Search ID** | `P6698` | Patrimoine culturel japonais |
| **UK Parliament ID** | — | Parlement britannique |
| **CORDIS project ID** | — | Projets de recherche européens |

---

## 🌐 1. Généralistes / Encyclopédiques

| Nom | Endpoint SPARQL | Licence | Triples (approx.) | Identifiants de liaison | Notes |
|---|---|---|---|---|---|
| **Wikidata** | `https://query.wikidata.org/sparql` | CC0 | ~15 milliards | Hub central : VIAF, GeoNames, ISNI, ORCID, DOI, GND, LoC, BnF, MusicBrainz, Getty, UniProt... | LE hub principal du LOD. GUI riche, fédération native. |
| **DBpedia** (EN) | `https://dbpedia.org/sparql` | CC BY-SA 3.0 | ~3 milliards | VIAF, GeoNames, MusicBrainz, owl:sameAs vers Wikidata | Extraction structurée de Wikipedia EN. |
| **DBpedia Live** | `https://dbpedia-live.openlinksw.com/sparql` | CC BY-SA 3.0 | ~3 milliards | Idem DBpedia | Mise à jour continue depuis Wikipedia. |
| **DBpedia FR** | `https://fr.dbpedia.org/sparql` | CC BY-SA 3.0 | ~500M | owl:sameAs vers DBpedia EN | DBpedia en français. |
| **DBpedia DE** | `https://de.dbpedia.org/sparql` | CC BY-SA 3.0 | ~800M | owl:sameAs vers DBpedia EN | DBpedia en allemand. |
| **DBpedia ES** | `https://es.dbpedia.org/sparql` | CC BY-SA 3.0 | ~400M | owl:sameAs vers DBpedia EN | DBpedia en espagnol. |
| **DBpedia NL** | `https://nl.dbpedia.org/sparql` | CC BY-SA 3.0 | ~300M | owl:sameAs vers DBpedia EN | DBpedia en néerlandais. |
| **Wikimedia Commons** | `https://commons-query.wikimedia.org/sparql` | CC0 | — | Liens vers Wikidata Q-items | Images, sons, vidéos libres de droit. |
| **FactForge** | `https://factforge.net/sparql` | Open | ~1 milliard | VIAF, GeoNames, MusicBrainz | Agrégation DBpedia + plusieurs LOD sources. |

---

## 🏛️ 2. Culture, Patrimoine, Arts & Histoire

| Nom | Endpoint SPARQL | Licence | Identifiants de liaison | Notes |
|---|---|---|---|---|
| **Europeana** | `https://sparql.europeana.eu/` | CC0 / CC BY | GeoNames, VIAF, DBpedia, Getty AAT | 50M+ objets culturels européens. Modèle EDM. |
| **British Museum** | `https://collection.britishmuseum.org/sparql` | CC BY-SA 4.0 | Getty ULAN/AAT, VIAF, GeoNames | Collections complètes du British Museum. Modèle CIDOC-CRM. |
| **Yale Center for British Art** | `https://collection.britishart.yale.edu/sparql` | CC0 | Getty ULAN/AAT | Collections d'art britannique. Modèle CIDOC-CRM. |
| **Rijksmuseum** | `https://data.rijksmuseum.nl/sparql` | CC0 | Getty ULAN/TGN/AAT, Wikidata | Art néerlandais, 800K+ objets. |
| **Smithsonian American Art Museum** | `https://americanart.si.edu/api/sparql` | CC0 | Getty ULAN, VIAF, Wikidata | Collections art américain. |
| **Getty Vocabularies** | `https://vocab.getty.edu/sparql` | CC BY 4.0 | VIAF, GeoNames, BnF, LoC, GND | ULAN (artistes), TGN (lieux), AAT (termes), IA (Iconography). Référence mondiale. |
| **Louvre** | `https://data.louvre.fr/sparql` | CC BY 4.0 | Getty ULAN/AAT, Europeana | Collections complètes du Louvre. |
| **Bibliothèque nationale de France (BnF)** | `https://data.bnf.fr/sparql` | Gallica Open License | VIAF, ISNI, Wikidata, LoC | Auteurs, œuvres, sujets. Référence pour la culture francophone. |
| **Japan Search** | `https://jpsearch.go.jp/rdf/sparql/` | CC BY 4.0 | Wikidata (P6698), Europeana | Patrimoine culturel japonais. Fédéré avec Wikidata. |
| **Finnish Museums** (Finto/MuseoSuomi) | `https://data.museofinland.fi/sparql` | CC0 | Wikidata, Getty AAT | Musées finlandais agrégés. |
| **CENSUS (Antiquités classiques)** | `https://census.de/sparql` | CC BY | Getty AAT, Wikidata | Réception de l'antiquité, Renaissance. Base Humboldt/Hertziana/Warburg. |
| **Archaeology Data Service (ADS)** | `https://data.archaeologydataservice.ac.uk/sparql` | Open | Getty AAT, GeoNames | Données archéologiques UK. CIDOC-CRM. |
| **Italian Cultural Heritage (MiBACT)** | `https://dati.beniculturali.it/sparql` | CC BY 4.0 | Wikidata, GeoNames | Ministère de la Culture IT. 170K+ institutions. |
| **Nomenclature** (Musées Canada) | `https://page.nomenclature.info/sparql` | CC BY-NC | Getty AAT | Thésaurus muséal franco-anglais, objets de collection. |
| **Europeana Fashion** | `https://data.europeana.eu/sparql` *(via Europeana)* | CC0 | Europeana, Getty AAT | Mode et textiles de collection. |
| **Norwegian Cultural Heritage** | `https://data.kulturminne.no/sparql` | NLOD | GeoNames, Wikidata | Patrimoine culturel norvégien. |
| **Swedish Open Cultural Heritage** (K-samsök) | `https://kulturarvsdata.se/sparql` | CC0 | GeoNames, Wikidata, VIAF | Agrégateur patrimoine suédois. |
| **Open Context** (Archéologie) | `https://opencontext.org/sparql` | CC BY | GeoNames, Getty AAT | Données archéologiques ouvertes. |

---

## 🔬 3. Sciences de la Vie / Biologie / Médecine

| Nom | Endpoint SPARQL | Licence | Identifiants de liaison | Notes |
|---|---|---|---|---|
| **UniProt** | `https://sparql.uniprot.org/sparql` | CC BY 4.0 | Ensembl, PDB, ChEMBL, Wikidata (P352), NCBI Gene | Référence mondiale des protéines. Mise à jour mensuelle. |
| **EMBL-EBI RDF Platform** | `https://rdf.ebi.ac.uk/sparql` | Open | UniProt, ChEMBL, Ensembl, Reactome, ArrayExpress | Hub bioinformatique européen. Plusieurs sub-endpoints. |
| **ChEMBL** | `https://www.ebi.ac.uk/rdf/services/sparql` | CC BY-SA 3.0 | UniProt, ChEMBL ID, PubChem, Wikidata (P592) | Composés bioactifs et données pharmacologiques. |
| **Reactome** | `https://www.reactome.org/sparql` | CC0 | UniProt, Ensembl, KEGG, GO | Voies biologiques et réactions. |
| **Bio2RDF** | Multiples (voir bio2rdf.org) | Open | NCBI, UniProt, DrugBank, OMIM | ~40 endpoints biomédicaux interconnectés. |
| **Orphanet** | `https://www.orpha.net/sparql` | CC BY 4.0 | Wikidata (P1550), OMIM, MeSH, ICD10, UMLS | Maladies rares. Ontologie officielle Orphanet/INSERM. |
| **Bgee** (Expression génique) | `https://www.bgee.org/sparql/` | CC0 | Ensembl, UniProt, NCBI Gene, GO | Expression des gènes par espèce et tissu. |
| **OntoBee** | `https://ontobee.org/sparql` | Open | GO, DO, CHEBI, HP, MP | Portail d'ontologies biomédicales (OBO Foundry). |
| **NCBO BioPortal** | `https://sparql.bioontology.org/sparql` | Open (avec clé) | GO, DO, SNOMED, NCI, MeSH | +900 ontologies biomédicales. Clé API requise. |
| **Linked Life Data** | `https://linkedlifedata.com/sparql` | Open | UniProt, OMIM, DrugBank, MeSH | Agrégateur données de santé. |
| **Open PHACTS** | ⚠️ `https://beta.openphacts.org/sparql` | Open | ChEMBL, UniProt, WikiPathways, DrugBank | Données pharmacologiques liées. |
| **WikiPathways** | `https://sparql.wikipathways.org/sparql` | CC0 | Ensembl, UniProt, ChEMBL, HMDB | Voies biologiques communautaires. |
| **IDSM** (Elixir Czech) | `https://idsm.elixir-czech.cz/sparql/endpoint/idsm` | Open | UniProt, ChEMBL, PubChem | Données moléculaires structurées. |
| **KEGG** | ⚠️ `https://www.genome.jp/sparql` | Non commercial | NCBI, UniProt, OMIM | Bases de données génomiques et métaboliques. |
| **Bgee** | `https://www.bgee.org/sparql` | CC0 | Ensembl, GO, Wikidata | Gène-anatomie-développement. |

---

## 🗺️ 4. Géographie & Environnement

| Nom | Endpoint SPARQL | Licence | Identifiants de liaison | Notes |
|---|---|---|---|---|
| **GeoNames** | `https://sws.geonames.org/sparql` | CC BY 4.0 | Wikidata (P1566), DBpedia, Getty TGN | 12M+ entités géographiques mondiales. |
| **QLever OSM** | `https://qlever.cs.uni-freiburg.de/api/osm-planet` | ODbL | Wikidata (via tags), GeoNames | OpenStreetMap complet en SPARQL. Très rapide (QLever engine). |
| **LinkedGeoData** | ⚠️ `https://linkedgeodata.org/sparql` | ODbL | DBpedia, Wikidata, GeoNames | OSM en RDF. Parfois instable. |
| **Ordnance Survey (UK)** | `https://data.ordnancesurvey.co.uk/datasets/boundary-line/explorer/sparql` | OGL | GeoNames, Wikidata | Géographie administrative UK. |
| **OpenHistoricalMap (QLever)** | `https://qlever.cs.uni-freiburg.de/api/ohm` | ODbL | Wikidata, GeoNames | OpenStreetMap historique avec données temporelles. |
| **NUTS / Eurostat Geography** | `https://data.europa.eu/sparql` | CC BY 4.0 | GeoNames, Wikidata, ISO 3166 | Régions statistiques européennes (NUTS). |
| **Global Biodiversity Facility (GBIF)** | ⚠️ (dumps RDF disponibles) | CC0 | NCBI Taxonomy, GBIF taxon key | Occurrences d'espèces mondiales. |
| **Linked Sensor Data** (W3C) | Multiples | Open | GeoNames, OGC standards | Données de capteurs IOT/environnementaux. |

---

## 📚 5. Bibliographie & Publications Académiques

| Nom | Endpoint SPARQL | Licence | Identifiants de liaison | Notes |
|---|---|---|---|---|
| **OpenCitations COCI** | `https://opencitations.net/index/coci/sparql` | CC0 | DOI, OMID, ORCID | Citations DOI-to-DOI. 1,7 milliard de citations. |
| **OpenCitations Meta** | `https://sparql.opencitations.net/meta` | CC0 | DOI, PMID, arXiv, ORCID, VIAF, ISBN, ISSN | Métadonnées bibliographiques. Hub de PIDs. |
| **OpenCitations (portail)** | `https://sparql.opencitations.net/` | CC0 | DOI, PMID, OMID | Portail unifié tous datasets OpenCitations. |
| **DBLP** | `https://sparql.dblp.org/sparql` | CC BY 4.0 | DOI, ORCID, Wikidata, OpenCitations | Informatique. Propulsé par QLever. Inclut citations OpenCitations. |
| **OpenAIRE Graph** | `https://api.openaire.eu/graph/sparql` *(expérimental)* | CC0 | DOI, ORCID, Crossref funder ID, Grant ID | Recherche financée par l'EU. 200M+ publications. |
| **CORDIS** | `https://data.europa.eu/api/sparql` | CC BY 4.0 | DOI, ORCID, Grant ID, Wikidata | Projets de recherche européens Horizon 2020/Europe. |
| **Semantic Scholar** | API uniquement (pas SPARQL natif) | Open | DOI, PMID, arXiv, Semantic Scholar ID | Agrégateur académique IA. |
| **Scholia** | Requêtes Wikidata | CC0 | ORCID, DOI (via Wikidata) | Profils chercheurs/journaux via Wikidata. |

---

## 🎵 6. Musique & Médias

| Nom | Endpoint SPARQL | Licence | Identifiants de liaison | Notes |
|---|---|---|---|---|
| **DBTune MusicBrainz** | `https://dbtune.org/musicbrainz/sparql` | CC BY-NC-SA | MBID, VIAF, DBpedia, foaf:Person | MusicBrainz en RDF. Modèle Music Ontology. |
| **DBTune Classical** | `https://dbtune.org/classical/sparql` | Open | MBID, DBpedia | Musique classique en RDF. |
| **BBC Music** (lod.openlinksw.com) | `https://lod.openlinksw.com/sparql` | Open | MBID, DBpedia, VIAF | BBC programmes et données musicales. |
| **BBC Programmes** | `https://programmes.api.bbc.co.uk/sparql` | Open | MBID, DBpedia | Programmes TV/Radio BBC en RDF. |
| **MusicBrainz JSON-LD** | API + JSON-LD (pas SPARQL natif) | CC0 | MBID, ISNI, VIAF, IMDb | Données disponibles mais endpoint SPARQL non maintenu. |

---

## 📖 7. Bibliothèques, Archives & Autorités

| Nom | Endpoint SPARQL | Licence | Identifiants de liaison | Notes |
|---|---|---|---|---|
| **Library of Congress** | `https://id.loc.gov/authorities/sparql` | Open (US Gov) | VIAF, ISNI, ORCID, Wikidata (P244) | Autorités LoC : noms, sujets, géographie, titres. |
| **VIAF (Virtual Int'l Authority File)** | ⚠️ Pas de SPARQL natif — données disponibles via dump | ODC-By | ISNI, Wikidata (P214), BnF, GND, LoC | Fusionne 40+ autorités mondiales. Utiliser via Wikidata pour requêtes SPARQL. |
| **ISNI** | Pas de SPARQL natif — utiliser via Wikidata | ISNI License | VIAF, ORCID, Wikidata (P213) | International Standard Name Identifier. |
| **GND (Allemagne)** | `https://hub.culturegraph.org/sparql` | CC0 | VIAF, Wikidata (P227), BnF, LoC | Normdatei allemande : personnes, lieux, œuvres. |
| **BnF Data** | `https://data.bnf.fr/sparql` | Gallica Open | VIAF (P268), ISNI, Wikidata, LoC | Référentiel national français. |
| **CONBAVIR (Espagne)** | `https://datos.bne.es/sparql` | CC0 | VIAF, Wikidata (P950) | Bibliothèque Nationale d'Espagne. |
| **Biblioteca Virtual Cervantes** | `https://data.bvmc.es/sparql` | CC0 | Wikidata (P2799), VIAF | Littérature hispanophone. |
| **AGORHA (France / INHA)** | `https://agorha.inha.fr/sparql` | Open | Getty ULAN, Wikidata, BnF | Personnes et institutions de l'histoire de l'art français. |
| **Persée** (France) | `https://data.persee.fr/sparql` | CC BY 4.0 | DOI, ARK, VIAF, BnF | Revues françaises numérisées en sciences humaines. |
| **HAL (France)** | `https://api.archives-ouvertes.fr/sparql` *(expérimental)* | CC BY | DOI, ORCID, ARK | Archive ouverte française. |
| **EThOS (UK British Library)** | ⚠️ En développement | Open | ORCID, DOI | Thèses britanniques. |
| **NIOD (WW2 Netherlands)** | `https://data.niod.nl/sparql` | Open | Wikidata, GeoNames | Données liées à la Seconde Guerre mondiale (Pays-Bas). |

---

## 🏛️ 8. Données Gouvernementales & Institutionnelles

| Nom | Endpoint SPARQL | Licence | Identifiants de liaison | Notes |
|---|---|---|---|---|
| **EU Open Data Portal** | `https://data.europa.eu/sparql` | CC BY 4.0 | Wikidata, GeoNames, NUTS, Eurostat | Portail données ouvertes UE. Inclut CORDIS, Eurostat, etc. |
| **Eurostat** | `https://data.europa.eu/sparql` *(via EU Data Portal)* | CC BY 4.0 | NUTS, ISO 3166, Wikidata | Statistiques européennes. |
| **UK Parliament** | `https://api.parliament.uk/sparql` | Open Parliament License | Wikidata, GeoNames | Actes législatifs, membres, circonscriptions. |
| **data.gov (US)** | `https://semantic.data.gov/sparql` | US Gov Open | GeoNames, Wikidata | Données fédérales américaines. |
| **data.gov.uk** | ⚠️ `https://data.gov.uk/sparql` | OGL UK | GeoNames, OS | Données gouvernementales UK. |
| **Open Government Data Austria** | `https://data.gv.at/sparql` | CC BY 4.0 | GeoNames, Wikidata | Données gouvernementales autrichiennes. |
| **Italian Open Data** | `https://dati.gov.it/sparql` | CC BY 4.0 | GeoNames, Wikidata | Données gouvernementales italiennes. |
| **Spanish Government** | `https://datos.gob.es/sparql` | CC BY 4.0 | GeoNames, Wikidata | Données gouvernementales espagnoles. |
| **Swiss Government** | `https://lindas.admin.ch/sparql` | Open | GeoNames, Wikidata | Données gouvernementales suisses. Plateforme LINDAS. |
| **INSEE (France)** | `https://rdf.insee.fr/sparql` | Open | GeoNames, Wikidata, COG | Statistiques et géographie administrative française. |
| **Open Corporate Data** | `https://opencorporates.com/sparql` *(limité)* | Open | Wikidata, LEI, GLEIF | Données entreprises mondiales. |

---

## 🔤 9. Langues, Ontologies & Thésaurus

| Nom | Endpoint SPARQL | Licence | Identifiants de liaison | Notes |
|---|---|---|---|---|
| **DBnary** | `https://kaiko.getalp.org/sparql` | CC BY-SA 3.0 | Wikidata, Lemon/OntoLex | Wiktionnaire en RDF. 25+ langues. |
| **Finto** (Finlande) | `https://api.finto.fi/sparql` | CC BY 4.0 | Wikidata, YSO ID (P2347), Getty AAT | Ontologies et thésaurus finlandais. Utilisé par Europeana. |
| **AGROVOC** (FAO) | `https://agrovoc.fao.org/sparql` | CC BY 3.0 | Wikidata, FAO, Getty AAT | Thésaurus agricole mondial, 40+ langues. |
| **EuroVoc** (EU) | `https://data.europa.eu/sparql` | CC BY 4.0 | Wikidata, SKOS-XL | Thésaurus multilingue UE, 24 langues. |
| **STW Thesaurus** (économie) | `https://zbw.eu/beta/sparql/stw/query` | CC BY 4.0 | GND, ORCID, Wikidata | Thésaurus économique allemand/anglais. |
| **GEMET** | `https://www.eionet.europa.eu/gemet/sparql` | CC BY 4.0 | Wikidata, Getty AAT | Thésaurus environnemental européen (EEA). |
| **EuroSciVoc** | `https://data.europa.eu/sparql` | CC BY 4.0 | Wikidata, OECD FoRD | Taxonomie des domaines scientifiques (UE). |
| **WordNet (Princeton)** | `https://wordnet.rkbexplorer.com/sparql` | Open | Wikidata, DBpedia | Lexique anglais avec relations sémantiques. |
| **BabelNet** | API (pas SPARQL natif) | Open | WordNet, Wikidata, DBpedia | Réseau lexical multilingue. |
| **Linked Open Vocabularies (LOV)** | `https://lov.linkeddata.es/dataset/lov/sparql` | CC BY 4.0 | Wikidata, Dublin Core, FOAF | Catalogue de vocabulaires RDF/OWL. |
| **SKOS Concepts** (W3C) | Via implémentations diverses | W3C | — | Standard W3C pour thésaurus. |

---

## 🔭 10. Astronomie & Sciences de la Terre

| Nom | Endpoint SPARQL | Licence | Identifiants de liaison | Notes |
|---|---|---|---|---|
| **Astronomical Object Database (SIMBAD)** | `https://simbad.u-strasbg.fr/simbad/sim-tap/sync` *(TAP/SPARQL)* | Open | Wikidata, NED, HD catalog | Base de données astronomiques. Protocole TAP. |
| **VizieR** (CDS Strasbourg) | `https://tapvizier.u-strasbg.fr/TAPVizieR/tap/sync` *(TAP)* | Open | SIMBAD, HiPS, Wikidata | Catalogues astronomiques. |
| **NASA/ADS** | API uniquement | Open | DOI, arXiv, ORCID, bibcode | Publications astronomiques. |
| **ORES** (Geology) | `https://geonetwork.ores.sk/sparql` | Open | GeoNames, Wikidata | Données géologiques. |

---

## ⚖️ 11. Droit & Législation

| Nom | Endpoint SPARQL | Licence | Identifiants de liaison | Notes |
|---|---|---|---|---|
| **EUR-Lex** | `https://publications.europa.eu/webapi/rdf/sparql` | CC BY 4.0 | ELI, CELEX, Wikidata | Législation européenne. European Legislation Identifier. |
| **European Case Law Identifier (ECLI)** | Via EUR-Lex | CC BY 4.0 | ELI, ECLI, Wikidata | Jurisprudence européenne. |
| **Swiss Linked Legal Data** | `https://fedlex.data.admin.ch/sparql` | CC BY 4.0 | ELI, Wikidata | Législation suisse. |
| **Årets rättskällor (Suède)** | `https://data.riksdagen.se/sparql` | Open | ELI | Législation suédoise. |
| **Open Legal Data (Allemagne)** | `https://de.openlegaldata.io/sparql` | Open | GND, Wikidata | Jurisprudence allemande. |
| **Linked Legal Data (UK)** | ⚠️ En développement | Open Parliament | UK Parliament ID, ELI | Législation UK. |

---

## 🏗️ 12. Architecture, Urbanisme & Infrastructure

| Nom | Endpoint SPARQL | Licence | Identifiants de liaison | Notes |
|---|---|---|---|---|
| **British Listed Buildings** | `https://linkeddata.ordnancesurvey.co.uk/sparql` | OGL | OS UPRN, GeoNames, Wikidata | Bâtiments classés britanniques. |
| **Europeana Architecture** | Via Europeana | CC0 | Getty AAT, GeoNames, Wikidata | Patrimoine architectural européen. |
| **Ariadne+ (Archéologie)** | `https://data.ariadne-plus.eu/sparql` | CC BY 4.0 | GeoNames, Getty AAT, CIDOC-CRM | Données archéologiques européennes intégrées. |

---

## 🧬 13. Sciences Naturelles & Biodiversité

| Nom | Endpoint SPARQL | Licence | Identifiants de liaison | Notes |
|---|---|---|---|---|
| **ITIS** (Integrated Taxonomic Info System) | Via DBpedia/Wikidata | Open | NCBI Taxonomy, Wikidata (P815), iNaturalist | Taxonomie biologique américaine. |
| **Encyclopedia of Life (EOL)** | ⚠️ API REST uniquement | CC BY | Wikidata (P830), GBIF, ITIS | Encyclopédie des espèces vivantes. |
| **TaxonConcept** | `https://lod.taxonconcept.org/sparql` | Open | NCBI Taxonomy, Wikidata, DBpedia | Taxonomie biologique liée. |
| **GFBio** | ⚠️ `https://terminologies.gfbio.org/sparql` | Open | NCBI Taxonomy, Wikidata | Terminologies biodiversité (Allemagne). |

---

## 📊 14. Statistiques & Données Économiques

| Nom | Endpoint SPARQL | Licence | Identifiants de liaison | Notes |
|---|---|---|---|---|
| **Linked Open Eurostat** | `https://data.europa.eu/sparql` | CC BY 4.0 | NUTS, ISO 3166, Wikidata | Statistiques économiques et sociales européennes. |
| **World Bank Open Data** | API REST (pas SPARQL natif) | CC BY 4.0 | ISO 3166, Wikidata | Données économiques mondiales. |
| **OECD iLibrary** | ⚠️ SPARQL expérimental | Open | Wikidata, ISO codes | Données statistiques OCDE. |
| **DBnomics** | API REST uniquement | Open | Eurostat, IMF, World Bank | Agrégateur de données économiques. |

---

## 🎓 15. Humanités Numériques & Recherche Spécialisée

| Nom | Endpoint SPARQL | Licence | Identifiants de liaison | Notes |
|---|---|---|---|---|
| **Pleiades** (Antiquité) | `https://pleiades.stoa.org/sparql` | CC BY 3.0 | GeoNames, Wikidata, Getty TGN | Lieux du monde antique gréco-romain. |
| **PeriodO** (Périodes historiques) | `https://client.perio.do/sparql` | CC0 | Wikidata, GeoNames | Référentiel de périodes historiques. |
| **SNAP:DRGN** (Personnes antiques) | `https://snapdrgn.net/sparql` | Open | Pleiades, Wikidata, VIAF | Réseau de personnes de l'Antiquité. |
| **Nomisma** (Numismatique) | `https://nomisma.org/query` | Open | Wikidata, Pleiades, Getty TGN | Vocabulaire lié de la numismatique. |
| **CLAROS** (Art classique) | ❌ Arrêté — ressources via Wikidata | — | — | Projet d'art classique Oxford. |
| **CRMbase** (CIDOC-CRM implementations) | Multiples selon institution | CIDOC-CRM | Getty, Wikidata, VIAF | Voir British Museum, Yale, Rijksmuseum. |
| **Slavery Maps** | `https://www.slaverymap.org/sparql` *(expérimental)* | CC BY | Wikidata, GeoNames | Traite des personnes réduites en esclavage, cartographie. |
| **HISCO** (Professions historiques) | Via Wikidata | Open | Wikidata | Classification des métiers historiques. |
| **Wikidata Scholarly (Scholia)** | `https://query-scholarly.wikidata.org/sparql` | CC0 | DOI, ORCID, PMID, Wikidata | Endpoint Wikidata optimisé pour la recherche académique. |

---

## ♻️ 16. Endpoints Arrêtés — Référence Historique

| Nom | Ancienne URL | Raison | Alternative |
|---|---|---|---|
| **Freebase** | `https://www.freebase.com/sparql` | Arrêté par Google (2016) | Wikidata |
| **SPARQL Europeana v1** | `https://europeana.eu/sparql` | Remplacé | `https://sparql.europeana.eu/` |
| **BBC Backstage** | `https://jena.hpl.hp.com:3040/backstage` | Arrêté | BBC Programmes |
| **LinkedBrainz SPARQL** | `https://linkedbrainz.org/sparql` | Non maintenu depuis 2011 | DBTune MusicBrainz ou JSON-LD MusicBrainz |
| **CLAROS** | `https://claros.ox.ac.uk/sparql` | Arrêté | Wikidata + Getty |
| **Sindice** | `https://sindice.com/sparql` | Arrêté (2013) | LOD Cloud direct |
| **OpenLink LOD Cache** | `https://lod.openlinksw.com/sparql` | Partiellement actif | Virtuoso DBpedia |

---

## 🔁 Schéma des Connexions Principales

```
Wikidata (hub central)
├── DBpedia (owl:sameAs via VIAF, GeoNames)
├── Getty (via P245/ULAN, P1667/TGN, P1014/AAT)
├── Europeana (via P7704)
├── VIAF (via P214) → BnF, LoC, GND, ISNI
├── GeoNames (via P1566) → Pleiades, Getty TGN
├── UniProt (via P352) → ChEMBL, Ensembl, Reactome
├── ORCID (via P496) → OpenCitations, DBLP
├── DOI (via P356) → OpenCitations, CrossRef, DBLP
├── MusicBrainz (via P434/P435) → DBTune, BBC Music
├── Orphanet (via P1550) → OMIM, MeSH, ICD10
└── Japan Search (via P6698) → Patrimoine japonais

OpenCitations
├── DOI → Wikidata, DBLP, Crossref
├── OMID ↔ DOI, PMID, arXiv, ISBN
└── ORCID → Wikidata, DBLP

Getty Vocabularies
├── ULAN (artistes) ↔ VIAF, Wikidata, BnF, LoC
├── TGN (lieux) ↔ GeoNames, Pleiades, Wikidata
└── AAT (termes) ↔ Wikidata, Europeana, musées
```

---

## 🛠️ Ressources de Monitoring

| Ressource | URL | Description |
|---|---|---|
| **LOD Cloud** | `https://lod-cloud.net/` | Carte visuelle du nuage LOD, 1000+ datasets |
| **Wikidata Federation Report** | `https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/Federation_report` | Tests automatiques des endpoints fédérés |
| **Wikidata Allowlist** | Via Wikidata wiki + Gerrit | Liste officielle des endpoints fédérables depuis WDQS |
| **SPARQLES** (archivé) | Vienna University — monitoring historique | Monitoring historique de disponibilité |
| **W3C Wiki Endpoints** | `https://www.w3.org/wiki/SparqlEndpoints` | Liste W3C (partiellement à jour) |

---

*Document compilé à partir de : W3C Wiki, Wikidata Federation Allowlist/Archive, LOD Cloud, CIDOC-CRM issue tracker, Programming Historian, DARIAH-Campus, documentation officielle de chaque endpoint. Février 2025.*
