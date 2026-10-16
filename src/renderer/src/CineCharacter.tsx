import { useId } from 'react';
import CineAccessory from './CineAccessory';
import type { Accessory } from './brain';

interface Face {
  eyeOpen: number;
  eyeBlush: number;
  eyeTear: number;
  mouthCurve: number;
  mouthOpen: number;
  bodyLean: number;
}

export interface FaceDisplay {
  label: string;
  value: string;
  progress: number;
  urgent?: boolean;
  expiresAt?: number;
}

/** Vector parts remain separate so expression and body motion stay crisp at every size. */
export default function CineCharacter({ face, gaze, sleeping, affectionate, propelled, display, headphones = false, accessory = 'none', headphoneColor = '#f3f6fb' }: {
  face: Face; gaze: { x: number; y: number }; sleeping: boolean; affectionate: boolean; propelled: boolean;
  display?: FaceDisplay | null;
  headphones?: boolean;
  accessory?: Accessory;
  headphoneColor?: string;
}) {
  const id = useId().replace(/:/g, '');
  const fill = (name: string) => `url(#${id}-${name})`;
  const closed = sleeping || face.eyeOpen < 0.2;
  const happy = affectionate || face.mouthCurve > 0.35;
  const gx = gaze.x * 7;
  const gy = gaze.y * 5;
  return (
    <svg className="cine-character" viewBox="0 0 220 240" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-phones`} x1="0" y1="0" x2=".9" y2="1">
          <stop stopColor="#ffffff" /><stop offset=".35" stopColor={headphoneColor} /><stop offset="1" stopColor={headphoneColor} stopOpacity=".8" />
        </linearGradient>
        <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="0.8" y2="1">
          <stop stopColor="#fffdf7" /><stop offset=".52" stopColor="#f1eee5" /><stop offset="1" stopColor="#acaea9" />
        </linearGradient>
        <linearGradient id={`${id}-amber`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ffe2a2" /><stop offset=".45" stopColor="#f2b960" /><stop offset="1" stopColor="#b66d2f" />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="#283d43" /><stop offset=".55" stopColor="#0b1e25" /><stop offset="1" stopColor="#071217" />
        </linearGradient>
        <linearGradient id={`${id}-reflection`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#d2e9e0" stopOpacity=".22" /><stop offset="1" stopColor="#e9ffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-shadow`}>
          <stop stopColor="#07171a" stopOpacity=".3" /><stop offset="1" stopColor="#07171a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-hover`}>
          <stop stopColor="#bcffe0" stopOpacity=".55" /><stop offset=".45" stopColor="#70e7c6" stopOpacity=".24" /><stop offset="1" stopColor="#70e7c6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-thrust`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#effff7" /><stop offset=".4" stopColor="#a0ffe2" stopOpacity=".8" /><stop offset="1" stopColor="#67d9c4" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>
      <ellipse className="cine-floor-shadow" cx="110" cy="225" rx="69" ry="10" fill={fill('shadow')} />
      {!sleeping && <ellipse className="cine-hover-halo" cx="110" cy="226" rx="54" ry="9" fill={fill('hover')} />}
      <g className="cine-floating-shell">
      <CineAccessory kind={accessory} layer="back" amber={fill('amber')} />
      {!sleeping && accessory !== 'hoverboard' && <g className={`cine-thrusters${propelled ? ' boosting' : ''}`}>
        <path d="M83 215Q89 225 94 215Q101 226 89 239Q77 226 83 215Z" fill={fill('thrust')} />
        <path d="M126 215Q131 225 137 215Q144 226 132 239Q120 226 126 215Z" fill={fill('thrust')} />
        <ellipse cx="89" cy="217" rx="7" ry="2" fill="#e4fff0" /><ellipse cx="132" cy="217" rx="7" ry="2" fill="#e4fff0" />
      </g>}
      <g className="cine-legs">
        <rect x="81" y="188" width="22" height="24" rx="10" fill="#6c7977" />
        <rect x="117" y="188" width="22" height="24" rx="10" fill="#6c7977" />
        <path d="M75 211Q78 201 94 204L105 209V218Q89 225 74 218Z" fill={fill('shell')} stroke="#afb6ae" strokeWidth="1" />
        <path d="M145 211Q142 201 126 204L115 209V218Q131 225 146 218Z" fill={fill('shell')} stroke="#afb6ae" strokeWidth="1" />
        <path d="M77 218Q91 222 103 216M117 216Q130 222 144 218" fill="none" stroke="#697a79" strokeWidth="2" />
      </g>
      <g className="cine-arm cine-arm-left">
        <circle cx="74" cy="145" r="9" fill="#647774" />
        <path d="M68 141Q58 139 55 153L51 174Q51 183 59 184Q69 181 69 174L77 150Z" fill={fill('shell')} stroke="#bbc1b7" />
        <path d="M52 175Q60 178 68 174" stroke="#9caca4" fill="none" />
      </g>
      <g className="cine-arm cine-arm-right">
        <circle cx="146" cy="145" r="9" fill="#647774" />
        <path d="M152 141Q162 139 165 153L169 174Q169 183 161 184Q151 181 151 174L143 150Z" fill={fill('shell')} stroke="#bbc1b7" />
        <path d="M152 174Q160 178 168 175" stroke="#9caca4" fill="none" />
      </g>
      <g className="cine-chassis">
        <rect x="98" y="118" width="24" height="20" rx="7" fill="#617571" />
        <path d="M89 130Q110 125 131 130Q144 138 146 163L142 187Q137 201 110 203Q83 201 78 187L74 163Q76 138 89 130Z" fill={fill('shell')} stroke="#c0c5bb" />
        <path d="M84 148Q86 136 99 135" stroke="#fffef7" strokeWidth="3" fill="none" strokeLinecap="round" />
        <rect x="94" y="148" width="32" height="30" rx="12" fill="#d1d4c8" stroke="#b8c3b3" />
        <rect x="97" y="150" width="26" height="24" rx="10" fill="#ecf0de" />
        <path className="cine-heart" d="M110 166l-6-5q-4-5 0-7q4-2 6 2q2-4 6-2q4 2 0 7z" fill="var(--acc)" />
        <circle cx="105" cy="189" r="1.3" fill="#8a9b8c" /><circle cx="110" cy="189" r="1.3" fill="#8a9b8c" /><circle cx="115" cy="189" r="1.3" fill="#8a9b8c" />
      </g>
      <CineAccessory kind={accessory} layer="body" amber={fill('amber')} />
      <CineAccessory kind={accessory} layer="feet" amber={fill('amber')} />
      <g className="cine-head" style={{ transform: `translate(${gaze.x * 2}px, ${gaze.y}px) rotate(${gaze.x * 4 + face.bodyLean * 12}deg)` }}>
        {headphones && <g className="cine-headphones">
          <path d="M46 81V55Q46 16 110 17Q174 16 174 55V81" fill="none" stroke="#a4b6c9" strokeWidth="13" />
          <path d="M46 66V54Q48 15 110 16Q172 15 174 54V66" fill="none" stroke={fill('phones')} strokeWidth="8" />
          <path d="M67 28Q110 8 153 28" fill="none" stroke="#ffffff" strokeWidth="1.8" opacity=".85" />
        </g>}
        <path d="M109 22V12" stroke="#7b8e83" strokeWidth="4" strokeLinecap="round" />
        <circle className="cine-signal" cx="109" cy="9" r="5" fill="var(--eye)" />
        <rect x="42" y="40" width="136" height="92" rx="36" fill={fill('shell')} stroke="#c0c5ba" />
        <path d="M59 53Q62 45 85 45H144" fill="none" stroke="#fffef7" strokeWidth="3" strokeLinecap="round" />
        <rect x="50" y="50" width="120" height="72" rx="28" fill={fill('glass')} stroke="#435651" strokeWidth="1.5" />
        <path d="M73 52H145Q162 52 165 67Q123 73 54 96V74Q53 58 73 52Z" fill={fill('reflection')} />
        {headphones && <g className="cine-headphones">
          <rect x="37" y="63" width="16" height="44" rx="7" fill="#bac8d8" stroke="#95a9c0" />
          <rect x="167" y="63" width="16" height="44" rx="7" fill="#bac8d8" stroke="#95a9c0" />
          <rect x="27" y="65" width="20" height="40" rx="9" fill={fill('phones')} stroke="#a9bfd5" />
          <rect x="173" y="65" width="20" height="40" rx="9" fill={fill('phones')} stroke="#a9bfd5" />
          <rect x="29" y="72" width="5" height="22" rx="2.5" fill="#ffffff" opacity=".85" />
          <rect x="185" y="72" width="5" height="22" rx="2.5" fill="#86bde1" opacity=".7" />
          <path d="M39 78v14M181 78v14" stroke="#76acd0" strokeWidth="1.5" strokeLinecap="round" />
        </g>}
        {display ? <g className={`cine-face-display${display.urgent ? ' urgent' : ''}`} role="img" aria-label={`${display.label} ${display.value}`}>
          <text className="cine-display-label" x="110" y="68" textAnchor="middle">{display.label}</text>
          <text className="cine-display-value" x="110" y="98" textAnchor="middle" fontSize={display.value.length > 5 ? 22 : 30}>{display.value}</text>
          <rect x="71" y="109" width="78" height="3" rx="1.5" className="cine-display-track" />
          <rect x="71" y="109" width={78 * Math.max(0, Math.min(1, display.progress))} height="3" rx="1.5" className="cine-display-progress" />
        </g> : <g className="cine-face" transform={`translate(${gx} ${gy})`} fill="var(--eye)">
          {!closed && !happy && <g>
            <rect x="76" y="71" width="17" height={24 * face.eyeOpen} rx="7" className="cine-eye-glow" filter={fill('glow')} opacity=".55" />
            <rect x="127" y="71" width="17" height={24 * face.eyeOpen} rx="7" filter={fill('glow')} opacity=".55" />
            <rect x="76" y={83 - 12 * face.eyeOpen} width="17" height={24 * face.eyeOpen} rx="7" />
            <rect x="127" y={83 - 12 * face.eyeOpen} width="17" height={24 * face.eyeOpen} rx="7" />
            <circle cx="81" cy="76" r="2" fill="#f0fff6" opacity=".8" /><circle cx="132" cy="76" r="2" fill="#f0fff6" opacity=".8" />
          </g>}
          {(closed || happy) && <g fill="none" stroke="var(--eye)" strokeWidth="4.5" strokeLinecap="round">
            <path d={happy ? 'M76 86Q84 72 93 86' : 'M76 84Q84 89 93 84'} />
            <path d={happy ? 'M127 86Q135 72 144 86' : 'M127 84Q135 89 144 84'} />
          </g>}
          {face.mouthOpen > 0.4 ? <ellipse cx="110" cy="101" rx="5" ry="6" /> : <path d={face.mouthCurve < 0 ? 'M104 104Q110 98 116 104' : 'M104 100Q110 106 116 100'} fill="none" stroke="var(--eye)" strokeWidth="2.7" strokeLinecap="round" />}
          <ellipse cx="70" cy="100" rx="7" ry="3" fill="#ffb2a1" opacity={face.eyeBlush} />
          <ellipse cx="151" cy="100" rx="7" ry="3" fill="#ffb2a1" opacity={face.eyeBlush} />
          {face.eyeTear > 0.4 && <path d="M89 95Q83 105 89 107Q95 105 89 95Z" fill="#89ddff" />}
        </g>}
        <circle cx="158" cy="113" r="1.5" fill="var(--eye)" opacity=".6" />
        {!(display && accessory === 'glasses') && <CineAccessory kind={accessory} layer="head" amber={fill('amber')} />}
      </g>
      </g>
    </svg>
  );
}
