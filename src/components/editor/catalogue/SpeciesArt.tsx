import { mulberry32 } from "@/editor/model/planting";
import type { Species } from "@/editor/model/species";
import { shade } from "@/editor/render/colors";

/**
 * A small stylised drawing of a plant, from its growth form and colours. Stands in for photos on
 * catalogue cards and pages. Drawn in a 120 × 90 box, standing on the ground at y = 84.
 */
export function SpeciesArt({ sp, className }: { sp: Species; className?: string }) {
  let seed = 7;
  for (let i = 0; i < sp.id.length; i++) seed = (seed * 31 + sp.id.charCodeAt(i)) | 0;
  const rnd = mulberry32(seed);
  const leaf = sp.foliage;
  const dark = shade(leaf, -0.28);
  const light = shade(leaf, 0.18);
  const bloom = sp.flower;
  const trunk = "#7a5a40";
  const G = 84;
  const parts: React.ReactNode[] = [];
  let k = 0;
  const add = (n: React.ReactNode) => parts.push(<g key={k++}>{n}</g>);
  /** Flower dots scattered over an ellipse. */
  const flowers = (cx: number, cy: number, rx: number, ry: number, n: number, r = 2.6) => {
    if (!bloom) return;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd());
      add(<circle cx={cx + Math.cos(a) * rx * d} cy={cy + Math.sin(a) * ry * d} r={r * (0.7 + rnd() * 0.5)} fill={bloom} stroke={shade(bloom, -0.2)} strokeWidth={0.5} />);
    }
  };
  const crown = (cx: number, cy: number, rx: number, ry: number) => {
    add(<ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={leaf} />);
    add(<ellipse cx={cx - rx * 0.25} cy={cy - ry * 0.3} rx={rx * 0.55} ry={ry * 0.45} fill={light} opacity={0.55} />);
    add(<ellipse cx={cx + rx * 0.3} cy={cy + ry * 0.35} rx={rx * 0.6} ry={ry * 0.4} fill={dark} opacity={0.35} />);
  };
  const stem = (x: number, h: number, w = 3) => add(<rect x={x - w / 2} y={G - h} width={w} height={h} rx={w / 2} fill={trunk} />);

  switch (sp.form) {
    case "round":
      stem(60, 30, 5);
      crown(60, 40, 30, 27);
      flowers(60, 40, 26, 22, 14);
      break;
    case "oval":
      stem(60, 26, 5);
      crown(60, 38, 22, 32);
      flowers(60, 38, 18, 26, 12);
      break;
    case "spreading":
      stem(60, 26, 6);
      crown(60, 46, 46, 20);
      flowers(60, 46, 40, 15, 16);
      break;
    case "columnar":
      stem(60, 10, 4);
      crown(60, 44, 12, 38);
      flowers(60, 44, 9, 32, 8);
      break;
    case "conical":
      stem(60, 8, 4);
      for (let i = 0; i < 3; i++) {
        const w = 34 - i * 9, top = 8 + i * 18, base = G - 6 - i * 4;
        add(<path d={`M${60 - w} ${base} L60 ${top} L${60 + w} ${base} Z`} fill={i % 2 ? dark : leaf} />);
      }
      break;
    case "weeping":
      stem(60, 46, 5);
      crown(60, 30, 26, 18);
      for (let i = 0; i < 9; i++) {
        const x = 38 + i * 5.5;
        add(<path d={`M${x} 30 Q ${x + (rnd() - 0.5) * 6} 55 ${x + (rnd() - 0.5) * 4} ${G - 8 - rnd() * 10}`} stroke={leaf} strokeWidth={5} fill="none" strokeLinecap="round" />);
      }
      flowers(60, 34, 22, 14, 8);
      break;
    case "mound":
      add(<path d={`M18 ${G} Q 22 30 60 30 Q 98 30 102 ${G} Z`} fill={leaf} />);
      add(<ellipse cx={50} cy={46} rx={22} ry={10} fill={light} opacity={0.5} />);
      flowers(60, 52, 34, 18, 18);
      break;
    case "upright": {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const x = 40 + i * 8 + (rnd() - 0.5) * 3, h = 44 + rnd() * 22;
        add(<path d={`M${x} ${G} L${x + (rnd() - 0.5) * 6} ${G - h}`} stroke={dark} strokeWidth={2} />);
        for (let j = 0; j < 3; j++) {
          const y = G - h * (0.25 + j * 0.22);
          add(<ellipse cx={x + (j % 2 ? 4 : -4)} cy={y} rx={5} ry={2.4} fill={leaf} transform={`rotate(${j % 2 ? -30 : 30} ${x} ${y})`} />);
        }
        if (bloom) add(<ellipse cx={x} cy={G - h - 3} rx={3.4} ry={6} fill={bloom} />);
      }
      break;
    }
    case "grassy":
      for (let i = 0; i < 22; i++) {
        const x = 60 + (rnd() - 0.5) * 16, lean = (rnd() - 0.5) * 70, h = 40 + rnd() * 30;
        add(<path d={`M${x} ${G} Q ${x + lean * 0.3} ${G - h * 0.7} ${x + lean} ${G - h}`} stroke={i % 3 ? leaf : dark} strokeWidth={2} fill="none" strokeLinecap="round" />);
      }
      if (bloom) for (let i = 0; i < 6; i++) add(<ellipse cx={45 + i * 6} cy={G - 58 - rnd() * 10} rx={2.2} ry={6} fill={bloom} opacity={0.85} />);
      break;
    case "rosette":
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        const x2 = 60 + Math.cos(a) * 30, y2 = G - 6 + Math.sin(a) * 16;
        add(<path d={`M60 ${G - 4} Q ${(60 + x2) / 2} ${y2 - 10} ${x2} ${y2}`} stroke={i % 2 ? leaf : dark} strokeWidth={7} fill="none" strokeLinecap="round" />);
      }
      if (bloom) {
        add(<path d={`M60 ${G - 10} L60 26`} stroke={dark} strokeWidth={2} />);
        flowers(60, 30, 7, 8, 7, 3.2);
      }
      break;
    case "carpet":
      add(<path d={`M10 ${G} Q 20 ${G - 16} 40 ${G - 14} Q 60 ${G - 20} 80 ${G - 14} Q 100 ${G - 16} 110 ${G} Z`} fill={leaf} />);
      add(<ellipse cx={45} cy={G - 10} rx={18} ry={4} fill={light} opacity={0.5} />);
      flowers(60, G - 8, 46, 6, 22, 2.2);
      break;
    case "climber":
      add(<rect x={30} y={10} width={60} height={G - 10} fill="none" stroke="#c9b597" strokeWidth={1.5} />);
      for (const x of [45, 60, 75]) add(<line x1={x} y1={10} x2={x} y2={G} stroke="#c9b597" strokeWidth={1.2} />);
      add(<path d={`M60 ${G} C 30 70, 90 55, 55 40 S 80 18, 62 12`} stroke={dark} strokeWidth={3} fill="none" />);
      for (let i = 0; i < 16; i++) add(<ellipse cx={36 + rnd() * 48} cy={14 + rnd() * 62} rx={6} ry={4} fill={i % 3 ? leaf : light} transform={`rotate(${rnd() * 180} 60 50)`} />);
      flowers(60, 40, 22, 28, 10);
      break;
  }
  return (
    <svg viewBox="0 0 120 90" className={className} aria-hidden>
      <ellipse cx={60} cy={G + 1} rx={42} ry={4} fill="rgba(60,50,30,0.14)" />
      {parts}
    </svg>
  );
}
