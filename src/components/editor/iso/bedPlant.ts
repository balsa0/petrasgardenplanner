import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { inMonths } from "@/editor/model/habit";
import { phase, type Phase } from "@/editor/model/phenology";
import { mulberry32 } from "@/editor/model/planting";
import { treeSize, type Species } from "@/editor/model/species";
import { mix, seasonLook } from "@/editor/render/colors";

/**
 * Bed plants as low-poly models that read as what they are: a leaf habit (mound, clump, strap
 * leaves, grass, fern, rosette, carpet, succulent, sprawl, stalk, tubes, fronds) carrying flowers of
 * their kind (spikes, daisies, umbels, globes, cups, trumpets, plumes, bells, sprays), and crops for
 * vegetables. Each plant is a handful of unit shapes, so a bed is drawn with one instanced mesh per
 * shape. Plants grow through the year: they emerge, reach full size as they flower, set seed heads,
 * colour, and die back in winter.
 */

export type Leaf = "mound" | "clump" | "strap" | "grass" | "fern" | "rosette" | "carpet" | "succulent" | "sprawl" | "stalk" | "tubes" | "fronds";
export type Bloom = "spike" | "daisy" | "umbel" | "globe" | "cup" | "trumpet" | "plume" | "bell" | "spray" | "none";
export type Crop = "tomato" | "pepper" | "squash" | "bean" | "corn" | "head" | "root" | "onion" | "potato";

export interface BedHabit {
  leaf: Leaf;
  bloom: Bloom;
  crop?: Crop;
  /** Share of the height that is leaves; flowers stand above on stems up to the full height. */
  leafShare: number;
  /** Flower size relative to the plant's radius, and how many flowers a plant of radius 1 m carries. */
  head: number;
  count: number;
}

const H = (leaf: Leaf, bloom: Bloom, leafShare = 0.75, head = 0.16, count = 9, crop?: Crop): BedHabit => ({ leaf, bloom, leafShare, head, count, crop });

const FAMILY: Record<string, BedHabit> = {
  Asteraceae: H("clump", "daisy", 0.7, 0.13, 14),
  Lamiaceae: H("mound", "spike", 0.6, 0.06, 18),
  Plantaginaceae: H("clump", "spike", 0.55, 0.08, 10),
  Fabaceae: H("clump", "spike", 0.55, 0.1, 8),
  Apiaceae: H("clump", "umbel", 0.55, 0.16, 7),
  Poaceae: H("grass", "plume", 0.7, 0.07, 12),
  Cyperaceae: H("grass", "none"),
  Juncaceae: H("grass", "none"),
  Amaryllidaceae: H("strap", "globe", 0.4, 0.2, 5),
  Liliaceae: H("stalk", "trumpet", 0.75, 0.2, 4),
  Asparagaceae: H("strap", "spike", 0.45, 0.08, 5),
  Iridaceae: H("strap", "cup", 0.6, 0.16, 5),
  Asphodelaceae: H("strap", "trumpet", 0.45, 0.14, 6),
  Ranunculaceae: H("clump", "cup", 0.65, 0.14, 8),
  Papaveraceae: H("clump", "cup", 0.55, 0.2, 6),
  Geraniaceae: H("mound", "cup", 0.85, 0.1, 16),
  Caryophyllaceae: H("mound", "spray", 0.8, 0.06, 18),
  Boraginaceae: H("mound", "spray", 0.85, 0.07, 14),
  Campanulaceae: H("mound", "bell", 0.75, 0.09, 14),
  Saxifragaceae: H("rosette", "spray", 0.45, 0.08, 10),
  Primulaceae: H("rosette", "umbel", 0.55, 0.12, 5),
  Crassulaceae: H("mound", "umbel", 0.8, 0.2, 5),
  Polemoniaceae: H("clump", "umbel", 0.7, 0.18, 6),
  Malvaceae: H("clump", "cup", 0.65, 0.16, 8),
  Paeoniaceae: H("mound", "globe", 0.8, 0.2, 7),
  Caprifoliaceae: H("mound", "globe", 0.75, 0.1, 12),
  Polygonaceae: H("clump", "spike", 0.6, 0.06, 10),
  Onagraceae: H("clump", "cup", 0.7, 0.1, 10),
  Euphorbiaceae: H("clump", "umbel", 0.8, 0.16, 8),
  Hypericaceae: H("mound", "cup", 0.85, 0.1, 14),
  Cistaceae: H("mound", "cup", 0.85, 0.1, 14),
  Rosaceae: H("mound", "cup", 0.85, 0.12, 12),
  Brassicaceae: H("mound", "spray", 0.8, 0.07, 14),
  Solanaceae: H("mound", "cup", 0.85, 0.08, 10),
  Verbenaceae: H("clump", "umbel", 0.75, 0.1, 10),
  Violaceae: H("carpet", "cup", 0.8, 0.12, 10),
  Gentianaceae: H("mound", "trumpet", 0.8, 0.1, 8),
  Amaranthaceae: H("clump", "plume", 0.65, 0.1, 6),
  Plumbaginaceae: H("mound", "globe", 0.5, 0.12, 6),
  Acanthaceae: H("clump", "spike", 0.5, 0.1, 5),
  Aizoaceae: H("carpet", "daisy", 0.9, 0.12, 14),
  Nymphaeaceae: H("sprawl", "cup", 0.9, 0.12, 3),
  Equisetaceae: H("tubes", "none"),
  Typhaceae: H("grass", "plume", 0.7, 0.06, 4),
  Acoraceae: H("strap", "none"),
  Alismataceae: H("strap", "spray", 0.6, 0.08, 4),
  Saururaceae: H("clump", "spike", 0.7, 0.06, 6),
  Balsaminaceae: H("mound", "cup", 0.85, 0.1, 12),
  Cucurbitaceae: H("sprawl", "trumpet", 0.9, 0.1, 4, "squash"),
  Hydrangeaceae: H("mound", "globe", 0.75, 0.22, 7),
  Ericaceae: H("mound", "bell", 0.9, 0.06, 18),
  Buxaceae: H("mound", "none"),
  Apocynaceae: H("carpet", "cup", 0.9, 0.08, 10),
};
const FERN_FAMILIES = new Set(["Dryopteridaceae", "Athyriaceae", "Polypodiaceae", "Aspleniaceae", "Osmundaceae", "Onocleaceae", "Blechnaceae", "Pteridaceae", "Thelypteridaceae", "Dennstaedtiaceae", "Woodsiaceae", "Cystopteridaceae"]);

const GENUS: Record<string, BedHabit> = {
  // Daisy family that isn't daisy-shaped.
  Achillea: H("fronds", "umbel", 0.6, 0.15, 7),
  Echinops: H("clump", "globe", 0.55, 0.1, 8),
  Liatris: H("strap", "spike", 0.4, 0.08, 6),
  Eupatorium: H("clump", "umbel", 0.75, 0.18, 6),
  Eutrochium: H("clump", "umbel", 0.75, 0.18, 6),
  Artemisia: H("mound", "none"),
  Santolina: H("mound", "globe", 0.75, 0.05, 18),
  Ligularia: H("rosette", "spike", 0.45, 0.08, 6),
  Helichrysum: H("mound", "spray"),
  Tanacetum: H("fronds", "daisy", 0.65, 0.08, 14),
  Cynara: H("rosette", "globe", 0.5, 0.18, 3),
  Helianthus: H("stalk", "daisy", 0.85, 0.22, 3),
  Tagetes: H("mound", "globe", 0.8, 0.12, 12),
  Calendula: H("mound", "daisy", 0.8, 0.13, 12),
  // Mint family exceptions.
  Thymus: H("carpet", "spray", 0.85, 0.06, 18),
  Origanum: H("mound", "spray", 0.8, 0.07, 16),
  Monarda: H("clump", "globe", 0.75, 0.1, 10),
  Phlomis: H("clump", "globe", 0.6, 0.08, 10),
  Mentha: H("clump", "spike", 0.75, 0.05, 12),
  Ocimum: H("mound", "spike", 0.85, 0.05, 8),
  // Bulbs and their kin.
  Tulipa: H("strap", "cup", 0.35, 0.22, 3),
  Narcissus: H("strap", "trumpet", 0.5, 0.2, 3),
  Crocus: H("strap", "cup", 0.6, 0.35, 3),
  Galanthus: H("strap", "bell", 0.6, 0.25, 3),
  Leucojum: H("strap", "bell", 0.5, 0.2, 4),
  Hyacinthus: H("strap", "spike", 0.4, 0.2, 2),
  Muscari: H("strap", "spike", 0.45, 0.15, 4),
  Scilla: H("strap", "bell", 0.5, 0.2, 4),
  Allium: H("tubes", "globe", 0.35, 0.18, 4),
  Agapanthus: H("strap", "globe", 0.4, 0.22, 3),
  Lilium: H("stalk", "trumpet", 0.75, 0.22, 4),
  Fritillaria: H("stalk", "bell", 0.7, 0.18, 3),
  Hemerocallis: H("strap", "trumpet", 0.5, 0.14, 7),
  Kniphofia: H("strap", "spike", 0.4, 0.09, 5),
  Eremurus: H("strap", "spike", 0.3, 0.1, 3),
  Iris: H("strap", "cup", 0.6, 0.15, 5),
  Crocosmia: H("strap", "spike", 0.5, 0.06, 8),
  Gladiolus: H("strap", "spike", 0.45, 0.09, 4),
  Hosta: H("rosette", "spike", 0.45, 0.06, 6),
  Convallaria: H("rosette", "bell", 0.75, 0.08, 6),
  Camassia: H("strap", "spike", 0.4, 0.08, 4),
  Freesia: H("strap", "trumpet", 0.5, 0.12, 4),
  Dahlia: H("clump", "daisy", 0.7, 0.16, 8),
  // Others with a shape of their own.
  Heuchera: H("rosette", "spray", 0.4, 0.06, 8),
  Heucherella: H("rosette", "spray", 0.4, 0.06, 8),
  Tiarella: H("rosette", "spike", 0.45, 0.05, 8),
  Bergenia: H("rosette", "umbel", 0.5, 0.15, 4),
  Astilbe: H("fronds", "plume", 0.55, 0.12, 6),
  Aruncus: H("fronds", "plume", 0.55, 0.12, 6),
  Filipendula: H("clump", "plume", 0.6, 0.14, 5),
  Alchemilla: H("mound", "spray", 0.85, 0.1, 10),
  Fragaria: H("carpet", "cup", 0.85, 0.08, 8),
  Geum: H("rosette", "cup", 0.5, 0.1, 8),
  Potentilla: H("mound", "cup", 0.85, 0.08, 14),
  Delphinium: H("clump", "spike", 0.45, 0.1, 5),
  Aconitum: H("clump", "spike", 0.55, 0.09, 6),
  Aquilegia: H("fronds", "bell", 0.55, 0.08, 9),
  Helleborus: H("mound", "cup", 0.8, 0.14, 8),
  Anemone: H("clump", "cup", 0.6, 0.12, 10),
  Pulsatilla: H("mound", "cup", 0.8, 0.18, 6),
  Thalictrum: H("fronds", "spray", 0.6, 0.12, 8),
  Paeonia: H("mound", "globe", 0.8, 0.2, 7),
  Lamprocapnos: H("fronds", "bell", 0.7, 0.07, 10),
  Dicentra: H("fronds", "bell", 0.7, 0.07, 10),
  Digitalis: H("rosette", "spike", 0.3, 0.12, 4),
  Lupinus: H("clump", "spike", 0.5, 0.12, 6),
  Verbascum: H("rosette", "spike", 0.25, 0.12, 3),
  Alcea: H("stalk", "spike", 0.4, 0.15, 3),
  Penstemon: H("clump", "bell", 0.6, 0.08, 10),
  Phlox: H("clump", "umbel", 0.75, 0.2, 6),
  Gypsophila: H("mound", "spray", 0.5, 0.18, 8),
  Dianthus: H("carpet", "spray", 0.7, 0.07, 14),
  Hylotelephium: H("succulent", "umbel", 0.85, 0.22, 5),
  Sedum: H("carpet", "spray", 0.85, 0.08, 14),
  Phedimus: H("carpet", "spray", 0.85, 0.08, 14),
  Sempervivum: H("succulent", "none"),
  Echeveria: H("succulent", "none"),
  Yucca: H("succulent", "spike", 0.4, 0.12, 1),
  Agave: H("succulent", "none"),
  Eryngium: H("rosette", "globe", 0.4, 0.07, 10),
  Hydrangea: H("mound", "globe", 0.75, 0.22, 7),
  Rosa: H("mound", "globe", 0.85, 0.08, 14),
  Lavandula: H("mound", "spike", 0.55, 0.05, 24),
  Salvia: H("mound", "spike", 0.6, 0.06, 16),
  Nepeta: H("mound", "spike", 0.65, 0.05, 22),
  Perovskia: H("clump", "spike", 0.5, 0.05, 16),
  Veronica: H("clump", "spike", 0.6, 0.06, 12),
  Veronicastrum: H("clump", "spike", 0.6, 0.06, 10),
  Agastache: H("clump", "spike", 0.6, 0.07, 10),
  Stachys: H("carpet", "spike", 0.4, 0.06, 8),
  Cyclamen: H("rosette", "cup", 0.6, 0.1, 6),
  Primula: H("rosette", "umbel", 0.55, 0.12, 4),
  Pulmonaria: H("mound", "spray", 0.85, 0.08, 10),
  Brunnera: H("rosette", "spray", 0.6, 0.12, 6),
  Vinca: H("carpet", "cup", 0.9, 0.06, 10),
  Ajuga: H("carpet", "spike", 0.5, 0.05, 10),
  Lysimachia: H("clump", "spike", 0.6, 0.07, 8),
  Ophiopogon: H("grass", "none"),
  Liriope: H("grass", "spike", 0.6, 0.05, 6),
  Pennisetum: H("grass", "plume", 0.6, 0.09, 12),
  Miscanthus: H("grass", "plume", 0.65, 0.07, 10),
  Calamagrostis: H("grass", "plume", 0.55, 0.05, 14),
  Stipa: H("grass", "plume", 0.5, 0.05, 14),
  Festuca: H("grass", "spike", 0.6, 0.03, 10),
  Cortaderia: H("grass", "plume", 0.5, 0.12, 8),
  Hakonechloa: H("grass", "none"),
  Carex: H("grass", "none"),
  Nymphaea: H("sprawl", "cup", 0.9, 0.12, 3),
  // Kitchen garden.
  Lactuca: H("rosette", "none", 1, 0, 0, "head"),
  Brassica: H("rosette", "none", 1, 0, 0, "head"),
  Spinacia: H("rosette", "none", 1, 0, 0, "head"),
  Cichorium: H("rosette", "none", 1, 0, 0, "head"),
  Beta: H("rosette", "none", 1, 0, 0, "head"),
  Daucus: H("fronds", "none", 1, 0, 0, "root"),
  Pastinaca: H("fronds", "none", 1, 0, 0, "root"),
  Raphanus: H("rosette", "none", 1, 0, 0, "root"),
  Anethum: H("fronds", "umbel", 0.6, 0.15, 5),
  Foeniculum: H("fronds", "umbel", 0.6, 0.15, 5),
  Petroselinum: H("fronds", "none"),
  Coriandrum: H("fronds", "umbel", 0.7, 0.1, 6),
  Capsicum: H("mound", "cup", 0.9, 0.05, 6, "pepper"),
  Phaseolus: H("clump", "spray", 0.9, 0.05, 8, "bean"),
  Pisum: H("clump", "spray", 0.9, 0.05, 8, "bean"),
  Zea: H("stalk", "plume", 0.85, 0.08, 1, "corn"),
  Cucurbita: H("sprawl", "trumpet", 0.9, 0.1, 3, "squash"),
  Cucumis: H("sprawl", "trumpet", 0.9, 0.06, 4, "squash"),
  Citrullus: H("sprawl", "trumpet", 0.9, 0.06, 3, "squash"),
  Rheum: H("rosette", "plume", 0.5, 0.12, 2),
  Asparagus: H("fronds", "none"),
};

/** How a bed plant looks, from its genus, family, form and category. */
export function bedHabitOf(sp: Species): BedHabit {
  const genus = sp.latin.split(/\s+/)[0];
  if (genus === "Solanum") {
    if (/lycopersicum/.test(sp.latin)) return H("clump", "cup", 0.9, 0.05, 6, "tomato");
    if (/melongena/.test(sp.latin)) return H("mound", "cup", 0.9, 0.06, 5, "pepper");
    if (/tuberosum/.test(sp.latin)) return H("mound", "cup", 0.85, 0.06, 10, "potato");
  }
  if (genus === "Allium") {
    if (/cepa|porrum|sativum|schoenoprasum|fistulosum|ampeloprasum/.test(sp.latin)) return H("tubes", sp.category === "herb" ? "globe" : "none", 0.6, 0.14, 4, "onion");
  }
  const g = GENUS[genus];
  if (g) return g;
  if (sp.category === "fern" || FERN_FAMILIES.has(sp.family)) return H("fern", "none");
  if (sp.category === "grass") return H("grass", "plume", 0.7, 0.06, 10);
  const f = FAMILY[sp.family];
  const base = f ?? H("mound", "spray");
  // The form in the data wins over the family's usual habit where they disagree.
  const leaf: Leaf =
    sp.form === "grassy" ? "grass" :
    sp.form === "carpet" ? "carpet" :
    sp.form === "rosette" ? (base.leaf === "succulent" ? "succulent" : "rosette") :
    sp.form === "upright" && base.leaf === "mound" ? "clump" :
    sp.form === "mound" && base.leaf === "clump" ? "mound" :
    base.leaf;
  return { ...base, leaf };
}

// ── Unit shapes: base on y = 0, about 1 across and 1 high ───────────────

export type Shape =
  | "leaf.mound" | "leaf.clump" | "leaf.strap" | "leaf.grass" | "leaf.fern" | "leaf.rosette" | "leaf.carpet" | "leaf.succulent"
  | "leaf.sprawl" | "leaf.stalk" | "leaf.tubes" | "leaf.fronds"
  | "bloom.spike" | "bloom.daisy" | "bloom.eye" | "bloom.umbel" | "bloom.globe" | "bloom.cup" | "bloom.trumpet" | "bloom.plume"
  | "bloom.bell" | "bloom.spray" | "stem" | "stake" | "fruit";

const cache = new Map<Shape, THREE.BufferGeometry>();

function flat(g: THREE.BufferGeometry) {
  const n = g.index ? g.toNonIndexed() : g;
  n.deleteAttribute("uv");
  n.deleteAttribute("normal");
  return n;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts.map(flat))!;
  g.computeVertexNormals();
  return g;
}

function jitter(g: THREE.BufferGeometry, seed: number, amount: number) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const rnd = mulberry32(seed);
  const offs = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let o = offs.get(k);
    if (o === undefined) offs.set(k, (o = 1 + (rnd() - 0.5) * 2 * amount));
    pos.setXYZ(i, x * o, y * o, z * o);
  }
  return g;
}

/** A strap or blade leaf: a thin tapered strip from the base, leaning out by `lean` and arching over. */
function blade(len: number, width: number, lean: number, yaw: number, arch = 0.3, segs = 3): THREE.BufferGeometry {
  const pos: number[] = [];
  let x = 0, y = 0, a = lean;
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= segs; i++) {
    pts.push([x, y, width * (1 - i / (segs + 0.6))]);
    x += Math.sin(a) * (len / segs);
    y += Math.cos(a) * (len / segs);
    a += arch;
  }
  for (let i = 0; i < segs; i++) {
    const [x0, y0, w0] = pts[i], [x1, y1, w1] = pts[i + 1];
    pos.push(x0, y0, -w0 / 2, x1, y1, -w1 / 2, x1, y1, w1 / 2, x0, y0, -w0 / 2, x1, y1, w1 / 2, x0, y0, w0 / 2);
    pos.push(x0, y0, -w0 / 2, x1, y1, w1 / 2, x1, y1, -w1 / 2, x0, y0, -w0 / 2, x0, y0, w0 / 2, x1, y1, w1 / 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.rotateY(yaw);
  return g;
}

const SHAPES: Record<Shape, () => THREE.BufferGeometry> = {
  "leaf.mound": () => {
    const rnd = mulberry32(11);
    const parts = [jitter(new THREE.IcosahedronGeometry(0.48, 1), 3, 0.12).scale(1, 0.85, 1).translate(0, 0.55, 0)];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rnd() * 0.4;
      parts.push(jitter(new THREE.IcosahedronGeometry(0.34, 0), 20 + i, 0.15).scale(1, 0.8, 1).translate(Math.cos(a) * 0.5, 0.3 + rnd() * 0.12, Math.sin(a) * 0.5));
    }
    return merge(parts);
  },
  "leaf.clump": () => {
    const rnd = mulberry32(12);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, d = 0.15 + rnd() * 0.25, h = 0.55 + rnd() * 0.45;
      parts.push(jitter(new THREE.IcosahedronGeometry(0.3, 0), 40 + i, 0.15).scale(0.8, h * 1.6, 0.8).translate(Math.cos(a) * d, h * 0.5, Math.sin(a) * d));
    }
    return merge(parts);
  },
  "leaf.strap": () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) parts.push(blade(1.05, 0.24, 0.15 + (i % 3) * 0.22, (i / 14) * Math.PI * 2 + (i % 2) * 0.3, 0.32));
    return merge(parts);
  },
  "leaf.grass": () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 26; i++) parts.push(blade(1.05, 0.11, 0.05 + (i % 4) * 0.13, (i / 26) * Math.PI * 2 * 3.1, 0.22 + (i % 3) * 0.08));
    return merge(parts);
  },
  "leaf.fern": () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      // A frond: a central blade with leaflets either side.
      const yaw = (i / 9) * Math.PI * 2;
      parts.push(blade(1.0, 0.5, 0.45 + (i % 2) * 0.2, yaw, 0.38, 4));
    }
    return merge(parts);
  },
  "leaf.rosette": () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const leaf = new THREE.IcosahedronGeometry(1, 0).scale(0.3, 0.1, 0.55);
      leaf.translate(0, 0.08, 0.45);
      leaf.rotateX(-0.5 - (i % 2) * 0.3);
      leaf.rotateY((i / 9) * Math.PI * 2);
      parts.push(leaf);
    }
    parts.push(new THREE.IcosahedronGeometry(0.3, 0).scale(1, 0.9, 1).translate(0, 0.25, 0));
    return merge(parts);
  },
  "leaf.carpet": () => {
    const rnd = mulberry32(14);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 0.65;
      parts.push(jitter(new THREE.IcosahedronGeometry(0.32, 0), 60 + i, 0.2).scale(1, 0.55, 1).translate(Math.cos(a) * d, 0.12 + rnd() * 0.12, Math.sin(a) * d));
    }
    return merge(parts);
  },
  "leaf.succulent": () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let ring = 0; ring < 3; ring++) {
      const n = 8 - ring * 2, lean = 1.2 - ring * 0.4, len = 0.6 - ring * 0.12;
      for (let i = 0; i < n; i++) {
        const c = new THREE.ConeGeometry(0.13 - ring * 0.02, len, 4).translate(0, len / 2, 0);
        c.rotateZ(lean);
        c.rotateY((i / n) * Math.PI * 2 + ring * 0.4);
        parts.push(c);
      }
    }
    return merge(parts);
  },
  "leaf.sprawl": () => {
    const rnd = mulberry32(15);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd() * 0.5, d = 0.2 + rnd() * 0.35;
      const leaf = new THREE.CylinderGeometry(0.26, 0.26, 0.03, 7).rotateX(-0.35).rotateY(-a);
      parts.push(leaf.translate(Math.cos(a) * d, 0.32 + rnd() * 0.25, Math.sin(a) * d));
      parts.push(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 3).rotateZ(Math.PI / 2 - 0.6).rotateY(-a).translate(Math.cos(a) * d * 0.5, 0.18, Math.sin(a) * d * 0.5));
    }
    return merge(parts);
  },
  "leaf.stalk": () => {
    const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.035, 0.05, 1, 5).translate(0, 0.5, 0)];
    for (let i = 0; i < 7; i++) parts.push(blade(0.45, 0.14, 0.9, i * 2.4, 0.35).translate(0, 0.12 + i * 0.11, 0));
    return merge(parts);
  },
  "leaf.tubes": () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, lean = 0.08 + (i % 3) * 0.08;
      const c = new THREE.CylinderGeometry(0.04, 0.06, 1, 4).translate(0, 0.5, 0);
      c.rotateZ(lean);
      c.rotateY(a);
      parts.push(c);
    }
    return merge(parts);
  },
  "leaf.fronds": () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 12; i++) {
      // Feathery fronds: a fine central blade with a cloud of leaflets.
      const yaw = (i / 12) * Math.PI * 2;
      parts.push(blade(1, 0.09, 0.25 + (i % 3) * 0.15, yaw, 0.18));
      const tip = new THREE.IcosahedronGeometry(0.22, 0).scale(1, 0.55, 1);
      const d = Math.sin(0.4 + (i % 3) * 0.15) * 0.7;
      parts.push(tip.translate(Math.cos(yaw) * d, 0.62 + (i % 2) * 0.15, -Math.sin(yaw) * d));
    }
    return merge(parts);
  },
  "bloom.spike": () => new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0),
  "bloom.daisy": () => new THREE.CylinderGeometry(1, 0.85, 0.16, 10),
  "bloom.eye": () => new THREE.IcosahedronGeometry(1, 0).scale(1, 0.6, 1),
  "bloom.umbel": () => new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1),
  "bloom.globe": () => new THREE.IcosahedronGeometry(1, 1),
  "bloom.cup": () => new THREE.CylinderGeometry(1, 0.55, 1.1, 7).translate(0, 0.55, 0),
  "bloom.trumpet": () => new THREE.CylinderGeometry(1, 0.2, 1, 7).translate(0, 0.5, 0),
  "bloom.plume": () => new THREE.IcosahedronGeometry(1, 0).scale(0.4, 1, 0.4).translate(0, 1, 0),
  "bloom.bell": () => new THREE.ConeGeometry(1, 1.2, 6).rotateX(Math.PI).translate(0, 0.6, 0),
  "bloom.spray": () => {
    const rnd = mulberry32(7);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) parts.push(new THREE.IcosahedronGeometry(0.35, 0).translate((rnd() - 0.5) * 1.3, rnd() * 0.5, (rnd() - 0.5) * 1.3));
    return merge(parts);
  },
  stem: () => new THREE.CylinderGeometry(1, 1, 1, 4).translate(0, 0.5, 0),
  stake: () => new THREE.CylinderGeometry(1, 1, 1, 5).translate(0, 0.5, 0),
  fruit: () => new THREE.IcosahedronGeometry(1, 1),
};

export function shapeGeometry(s: Shape): THREE.BufferGeometry {
  let g = cache.get(s);
  if (!g) {
    g = SHAPES[s]();
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    cache.set(s, g);
  }
  return g;
}

// ── One plant ────────────────────────────────────────────────────────────

export interface BedPart {
  shape: Shape;
  m: THREE.Matrix4;
  color: THREE.Color;
}

const STEM = "#5f7d3f";
const WOOD = "#8a6a48";
const TWIGS = "#7a6650";

const WOODY = new Set(["shrub", "rose", "tree", "fruit", "conifer", "climber"]);
const WARM_CROPS = new Set<Crop>(["tomato", "pepper", "squash", "bean", "corn", "potato"]);

/** Vegetables: sown or planted out in spring (warm crops after the frosts), grown on, cleared in autumn. */
function cropPhase(sp: Species, hab: BedHabit, month: number): Phase {
  const warm = !!hab.crop && WARM_CROPS.has(hab.crop);
  const start = warm ? 5 : 4, end = warm ? 10 : 11;
  const none = { heads: "none" as const, headColor: null };
  if (!inMonths(month, start, end)) return { stage: "dormant", size: 0, spread: 0, leaf: sp.foliage, hidden: true, ...none };
  const k = Math.min(1, (month - start + 1) / 3);
  const open = !!sp.bloom && inMonths(month, sp.bloom[0], sp.bloom[1]);
  return { stage: k < 1 ? "growing" : open ? "bloom" : "full", size: 0.3 + 0.7 * k, spread: 0.6 + 0.4 * k, leaf: sp.foliage, hidden: false, heads: open ? "open" : "none", headColor: open ? sp.flower : null };
}

/** Shrubs and roses in beds keep their size; their leaves come and go with their habit. */
function woodyPhase(sp: Species, month: number): Phase {
  const look = seasonLook(sp, month);
  return {
    stage: look.bare ? "dormant" : look.flower ? "bloom" : "full",
    size: 1,
    spread: 1,
    leaf: look.bare ? TWIGS : look.canopy,
    hidden: false,
    heads: look.flower ? "open" : "none",
    headColor: look.flower,
  };
}

/** Where a plant is in its year: crops, shrubs and everything else each keep their own calendar. */
export function bedPhase(sp: Species, month: number): Phase {
  const hab = bedHabitOf(sp);
  if (hab.crop || sp.category === "vegetable") return cropPhase(sp, hab, month);
  if (WOODY.has(sp.category)) return woodyPhase(sp, month);
  return phase(sp, month);
}

/** The parts of one bed plant standing at (x, y, z), `v` its 0–1 variation, at an age and month. */
export function bedPlantParts(sp: Species, x: number, y: number, z: number, v: number, years: number, month: number): BedPart[] {
  const hab = bedHabitOf(sp);
  const woody = WOODY.has(sp.category);
  const ph = bedPhase(sp, month);
  const out: BedPart[] = [];
  if (ph.hidden) return out;
  const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), v * Math.PI * 2);
  const put = (shape: Shape, px: number, py: number, pz: number, sx: number, sy: number, sz: number, color: string | THREE.Color, q: THREE.Quaternion = rot) =>
    out.push({ shape, m: new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), q, new THREE.Vector3(sx, sy, sz)), color: color instanceof THREE.Color ? color : new THREE.Color(color) });

  const size = treeSize(sp, 1 + years);
  const r0 = (size.spread / 2) * (0.88 + v * 0.24);
  const h0 = size.height * (0.9 + v * 0.2);
  const r = r0 * ph.spread;
  const h = h0 * ph.size;

  // Winter states first.
  if (ph.stage === "cut" || (ph.stage === "dormant" && !woody)) {
    // Cut back to stubble (grasses) or a low crown.
    if (hab.leaf === "grass") put("leaf.grass", x, y, z, r0 * 0.5, Math.max(0.05, h0 * 0.1), r0 * 0.5, ph.leaf);
    else put("leaf.carpet", x, y, z, r0 * 0.4, Math.max(0.04, h0 * 0.08), r0 * 0.4, ph.leaf);
    return out;
  }
  const leafColor = new THREE.Color(ph.leaf);
  if (ph.stage === "dormant") {
    // Bare shrub or rose: a twiggy frame.
    put("leaf.clump", x, y, z, r * 0.8, h * 0.85, r * 0.8, leafColor);
    return out;
  }
  if (ph.stage === "straw" && hab.leaf !== "grass") {
    // A perennial's winter skeleton: dark stems holding last summer's heads.
    const n = Math.max(3, Math.round(hab.count * Math.max(0.35, r0 * 2) * 0.6));
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996 + v * 6, d = Math.sqrt((i + 0.5) / n) * r0 * 0.5;
      put("stem", x + Math.cos(a) * d, y, z + Math.sin(a) * d, 0.007, h * (0.75 + (0.25 * ((i * 7) % 4)) / 3), 0.007, leafColor);
    }
    addHeads(h);
    return out;
  }

  const shoots = ph.stage === "shoots";
  const showHeads = ph.heads !== "none" && hab.bloom !== "none";
  const leafH = showHeads ? h * hab.leafShare : h;
  const L = shoots && (hab.leaf === "mound" || hab.leaf === "carpet") ? "clump" : hab.leaf;
  const wide = L === "carpet" || L === "sprawl" ? 1.05 : L === "clump" || L === "stalk" || L === "tubes" ? 0.75 : 1;
  const lh = L === "carpet" ? Math.min(leafH, Math.max(0.06, r * 0.4)) : L === "rosette" || L === "succulent" ? Math.min(leafH, Math.max(0.08, r * 0.8)) : leafH;
  put(`leaf.${L}` as Shape, x, y, z, r * wide, lh, r * wide, leafColor);

  // ── Crops ──
  if (hab.crop) {
    const fruit = sp.flower ? new THREE.Color(sp.flower) : new THREE.Color("#c0392b");
    const rnd = mulberry32(Math.floor(v * 1e6));
    const ripe = ph.size >= 0.95;
    switch (hab.crop) {
      case "tomato":
        put("stake", x + r * 0.15, y, z, 0.012, h0 * 1.1, 0.012, WOOD);
        if (ripe) for (let i = 0; i < 6; i++) put("fruit", x + (rnd() - 0.5) * r, y + h * (0.3 + rnd() * 0.5), z + (rnd() - 0.5) * r, 0.03, 0.03, 0.03, rnd() > 0.3 ? fruit : "#7aa84c");
        break;
      case "pepper":
        if (ripe) for (let i = 0; i < 5; i++) put("fruit", x + (rnd() - 0.5) * r, y + h * (0.35 + rnd() * 0.4), z + (rnd() - 0.5) * r, 0.025, 0.04, 0.025, fruit);
        break;
      case "squash":
        if (ripe) for (let i = 0; i < 2; i++) put("fruit", x + (rnd() - 0.5) * r * 1.2, y + 0.08, z + (rnd() - 0.5) * r * 1.2, r * 0.18, r * 0.15, r * 0.18, fruit);
        break;
      case "bean":
        // A wigwam of canes the beans climb.
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18));
          put("stake", x + Math.cos(a) * r * 0.5, y, z + Math.sin(a) * r * 0.5, 0.01, Math.max(h0, 1.6), 0.01, WOOD, q);
        }
        break;
      case "corn":
        for (let i = 0; i < 2; i++) put("bloom.plume", x + (i - 0.5) * 0.04, y + h * 0.95, z, 0.03, 0.08, 0.03, "#c9b06a");
        if (ripe) put("fruit", x + 0.04, y + h * 0.55, z, 0.03, 0.09, 0.03, "#d8c05a");
        break;
      case "head":
        put("fruit", x, y + lh * 0.45, z, r * 0.42, lh * 0.42, r * 0.42, mixColor(leafColor, "#ffffff", 0.15));
        break;
      case "root":
        if (ripe) put("fruit", x, y + 0.01, z, 0.02, 0.015, 0.02, fruit);
        break;
      case "onion":
      case "potato":
        break;
    }
  }
  if (showHeads) addHeads(lh);
  return out;

  /** Flower heads (buds, open flowers or seed heads) above or among leaves `lh` tall. */
  function addHeads(lh: number) {
    if (hab.bloom === "none" || ph.heads === "none" || !ph.headColor) return;
    const color = new THREE.Color(ph.headColor);
    const budding = ph.heads === "bud", seeds = ph.heads === "seed";
    const scale = budding ? 0.45 : seeds ? 0.75 : 1;
    const rnd = mulberry32(Math.floor(v * 1e6) + 7);
    const n = Math.max(1, Math.min(28, Math.round(hab.count * Math.max(0.35, r0 * 2) * (budding ? 0.6 : 1))));
    const fs = Math.max(0.018, Math.min(0.22, r0 * 2 * hab.head)) * scale;
    const above = Math.max(0, h - lh);
    const spread = hab.leaf === "carpet" || hab.leaf === "mound" ? 0.8 : 0.55;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996 + v * 6, d = Math.sqrt((i + 0.5) / n) * r * spread;
      const fx = x + Math.cos(a) * d, fz = z + Math.sin(a) * d;
      // Flowers in or just over the leaves (mounds, carpets) or on stems up to the full height.
      const top = above > 0.05 ? lh + above * (0.65 + 0.35 * rnd()) : lh * (0.8 + 0.25 * rnd());
      if (above > 0.05) put("stem", fx, y + lh * 0.6, fz, 0.006 + fs * 0.05, top - lh * 0.6, 0.006 + fs * 0.05, seeds ? ph.leaf : STEM);
      const fy = y + top;
      switch (hab.bloom) {
        case "spike": {
          const len = Math.max(fs * 2, above > 0.05 ? above * 0.55 : h * 0.3) * scale;
          put("bloom.spike", fx, fy - len * 0.2, fz, fs * 0.6, len, fs * 0.6, color);
          break;
        }
        case "daisy":
          if (seeds) put("bloom.eye", fx, fy, fz, fs * 0.45, fs * 0.45, fs * 0.45, color);
          else {
            put("bloom.daisy", fx, fy, fz, fs, fs, fs, color);
            if (!budding) put("bloom.eye", fx, fy + fs * 0.08, fz, fs * 0.38, fs * 0.38, fs * 0.38, eyeColor(sp, color));
          }
          break;
        case "umbel":
          put("bloom.umbel", fx, fy, fz, fs, fs, fs, color);
          break;
        case "globe":
          put("bloom.globe", fx, fy, fz, fs * 0.8, fs * 0.8, fs * 0.8, color);
          break;
        case "cup":
          put("bloom.cup", fx, fy - fs * 0.5, fz, fs * 0.55, fs * 0.8, fs * 0.55, color);
          break;
        case "trumpet":
          put("bloom.trumpet", fx, fy - fs * 0.4, fz, fs * 0.6, fs * 0.9, fs * 0.6, color);
          break;
        case "plume":
          put("bloom.plume", fx, fy - fs * 1.4, fz, fs * 0.8, fs * 1.6, fs * 0.8, color);
          break;
        case "bell":
          put("bloom.bell", fx, fy - fs * 0.8, fz, fs * 0.45, fs * 0.6, fs * 0.45, color);
          break;
        case "spray":
          put("bloom.spray", fx, fy - fs * 0.3, fz, fs * 1.4, fs * 1.4, fs * 1.4, color);
          break;
      }
    }
  }
}

function mixColor(c: THREE.Color, hex: string, k: number): THREE.Color {
  return new THREE.Color(mix(`#${c.getHexString()}`, hex, k));
}

/** The middle of a daisy: dark for yellow and orange ones, gold for white, pink and blue ones. */
function eyeColor(sp: Species, petals: THREE.Color): string {
  const g = sp.latin.split(/\s+/)[0];
  if (g === "Echinacea") return "#8a4a1a";
  const hsl = { h: 0, s: 0, l: 0 };
  petals.getHSL(hsl);
  return hsl.h > 0.05 && hsl.h < 0.17 && hsl.s > 0.4 ? "#3a2614" : "#e3b51e";
}
