import { honoursOf, type Honour } from '../utils/permissions';
import type { UserProfile } from '../types';
import './HonourMark.css';

/** Latin cross, in a 32×32 box. */
const CROSS = 'M12.9 2h6.2v8.2h8.3v6.2h-8.3V30h-6.2V16.4H4.6v-6.2h8.3z';

/** Four-point star, centred on the origin so a <g> can place it. */
function star(r: number): string {
  const w = r * 0.2;
  return `M0 ${-r}Q${w} ${-w} ${r} 0Q${w} ${w} 0 ${r}Q${-w} ${w} ${-r} 0Q${-w} ${-w} 0 ${-r}Z`;
}

type Line = { id: string; x1: number; y1: number; x2: number; y2: number };

/** The gold both marks are struck from — light, rich, deep, light again. */
function Gold({ id, x1, y1, x2, y2 }: Line) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
      <stop offset="0" stopColor="#fff6d5" />
      <stop offset="0.3" stopColor="#f2c744" />
      <stop offset="0.62" stopColor="#b07d16" />
      <stop offset="1" stopColor="#ffe9a3" />
    </linearGradient>
  );
}

/**
 * The polished band that makes the metal read as metal. It is painted over the
 * whole shape and fades to nothing at both ends, so the highlight has no edge
 * of its own — an edge would read as a facet rather than a shine.
 */
function Sheen({ id, x1, y1, x2, y2 }: Line) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
      <stop offset="0.12" stopColor="#ffffff" stopOpacity="0" />
      <stop offset="0.34" stopColor="#ffffff" stopOpacity="0.72" />
      <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
    </linearGradient>
  );
}

function Medal() {
  return (
    <svg className="hm-svg" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <Gold id="hm-medal-gold" x1={8} y1={13} x2={25} y2={29} />
        <Sheen id="hm-medal-sheen" x1={8} y1={13} x2={24} y2={29} />
        {/* Darker than the disc, so the ribbon reads behind it rather than as
            part of it. */}
        <linearGradient id="hm-medal-ribbon" gradientUnits="userSpaceOnUse" x1={8} y1={2} x2={24} y2={15}>
          <stop offset="0" stopColor="#d9b257" />
          <stop offset="1" stopColor="#8a6410" />
        </linearGradient>
      </defs>

      {/* Two tails, splayed wide at the top so the V is legible at 32px. */}
      <path d="M6.4 1.6h5.9l3.4 11.4-5.9 1.9z" fill="url(#hm-medal-ribbon)" />
      <path d="M25.6 1.6h-5.9l-3.4 11.4 5.9 1.9z" fill="url(#hm-medal-ribbon)" />

      <circle cx="16" cy="21" r="8.7" fill="url(#hm-medal-gold)" />
      <circle cx="16" cy="21" r="5.8" fill="none" stroke="#8a6410" strokeOpacity="0.42" strokeWidth="1.1" />
      <circle cx="16" cy="21" r="8.7" fill="url(#hm-medal-sheen)" />

      <g transform="translate(27.2 7.2)">
        <path className="hm-glint" d={star(2.9)} fill="#fffdf2" />
      </g>
    </svg>
  );
}

/** Almond eye. The curve is symmetric, so x runs linearly along the lids. */
const EYE = 'M2.5 16Q16 -0.5 29.5 16Q16 32.5 2.5 16Z';

function Eye() {
  return (
    <svg className="hm-svg" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <Sheen id="hm-eye-sheen" x1={3} y1={8} x2={27} y2={24} />
        <linearGradient id="hm-eye-white" gradientUnits="userSpaceOnUse" x1={4} y1={8} x2={28} y2={24}>
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#f4f6fb" />
          <stop offset="1" stopColor="#d8dfea" />
        </linearGradient>
        {/* A gold iris, so the eye belongs to the same set as the other two. */}
        <radialGradient id="hm-eye-iris" cx="0.38" cy="0.32" r="0.78">
          <stop offset="0" stopColor="#ffe9a3" />
          <stop offset="0.5" stopColor="#f2c744" />
          <stop offset="1" stopColor="#a5761a" />
        </radialGradient>
      </defs>

      <path d={EYE} fill="url(#hm-eye-white)" />
      {/* Polish goes on the white only. Over the iris it just bleaches it. */}
      <path d={EYE} fill="url(#hm-eye-sheen)" />
      <path d={EYE} fill="none" stroke="#8a6410" strokeOpacity="0.32" strokeWidth="1" />

      <circle cx="16" cy="16" r="6" fill="url(#hm-eye-iris)" />
      <circle cx="16" cy="16" r="2.9" fill="#3a2a08" />
      {/* The catchlight is the one detail that makes an eye look wet. */}
      <circle cx="13.4" cy="13.2" r="1.6" fill="#ffffff" />

      <g transform="translate(27.4 6.4)">
        <path className="hm-glint" d={star(2.8)} fill="#fffdf2" />
      </g>
    </svg>
  );
}

function Cross() {
  return (
    <svg className="hm-svg" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <Gold id="hm-cross-gold" x1={5} y1={2} x2={27} y2={30} />
        <Sheen id="hm-cross-sheen" x1={4} y1={2} x2={24} y2={26} />
      </defs>

      <path d={CROSS} fill="url(#hm-cross-gold)" />
      <path d={CROSS} fill="none" stroke="#8a6410" strokeOpacity="0.3" strokeWidth="0.9" />
      <path d={CROSS} fill="url(#hm-cross-sheen)" />

      <g transform="translate(25.4 6.2)">
        <path className="hm-glint" d={star(2.9)} fill="#fffdf2" />
      </g>
    </svg>
  );
}

const MARKS: Record<Honour, () => JSX.Element> = {
  observer: Eye,
  winner: Medal,
  protector: Cross,
};

/**
 * The marks someone carries for the honours granted by hand on the roster: an
 * eye from an event of its own, a medal for the winners, a cross for the
 * protectors. Any of them can be held together and all of them are then shown,
 * in permission order. Renders nothing at all for everybody else.
 *
 * Purely decorative — every mark is aria-hidden and carries no label, so screen
 * readers pass straight over them. The two SVGs namespace their own gradient
 * ids, so drawing them side by side does not cross the wires.
 */
export default function HonourMark({
  profile,
  className,
}: {
  profile: UserProfile | null;
  className?: string;
}) {
  const honours = honoursOf(profile);
  if (honours.length === 0) return null;

  return (
    <span className={className ? `hm-marks ${className}` : 'hm-marks'}>
      {honours.map((honour) => {
        const Mark = MARKS[honour];
        return (
          <span key={honour} className="hm">
            <Mark />
          </span>
        );
      })}
    </span>
  );
}
