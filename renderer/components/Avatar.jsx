import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';

/**
 * Generates a consistent color from a string (name or email).
 */
function stringToColor(str) {
  if (!str) return '#6c757d';
  const palette = [
    '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
    '#3498db', '#2980b9', '#9b59b6', '#8e44ad', '#e91e63',
    '#00bcd4', '#4caf50', '#ff5722', '#607d8b', '#795548',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

/**
 * Gets the initials from a display name or email.
 */
function getInitials(name, email) {
  const source = name || email || '?';
  // If it looks like an email, use the part before @
  const base = source.includes('@') ? source.split('@')[0] : source;
  const parts = base.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

/**
 * Simple MD5 implementation for Gravatar (no npm dependency needed).
 */
function md5(str) {
  function safeAdd(x, y) { const lsw=(x&0xffff)+(y&0xffff);const msw=(x>>16)+(y>>16)+(lsw>>16);return(msw<<16)|(lsw&0xffff); }
  function bitRotateLeft(num,cnt){return(num<<cnt)|(num>>>(32-cnt));}
  function md5cmn(q,a,b,x,s,t){return safeAdd(bitRotateLeft(safeAdd(safeAdd(a,q),safeAdd(x,t)),s),b);}
  function md5ff(a,b,c,d,x,s,t){return md5cmn((b&c)|((~b)&d),a,b,x,s,t);}
  function md5gg(a,b,c,d,x,s,t){return md5cmn((b&d)|(c&(~d)),a,b,x,s,t);}
  function md5hh(a,b,c,d,x,s,t){return md5cmn(b^c^d,a,b,x,s,t);}
  function md5ii(a,b,c,d,x,s,t){return md5cmn(c^(b|(~d)),a,b,x,s,t);}
  function rhex(n){let s='',j=0;for(;j<4;j++)s+=('0'+(n>>>j*8&0xFF).toString(16)).slice(-2);return s;}
  function hex(x){let s='';for(let i=0;i<x.length;i++)s+=rhex(x[i]);return s;}
  function str2binl(str){const bin=[];const mask=(1<<8)-1;for(let i=0;i<str.length*8;i+=8)bin[i>>5]|=(str.charCodeAt(i/8)&mask)<<(i%32);return bin;}
  function binlMD5(x,len){
    x[len>>5]|=0x80<<(len%32);x[(((len+64)>>>9)<<4)+14]=len;
    let i,olda,oldb,oldc,oldd,a=1732584193,b=-271733879,c=-1732584194,d=271733878;
    for(i=0;i<x.length;i+=16){olda=a;oldb=b;oldc=c;oldd=d;
      a=md5ff(a,b,c,d,x[i],7,-680876936);d=md5ff(d,a,b,c,x[i+1],12,-389564586);c=md5ff(c,d,a,b,x[i+2],17,606105819);b=md5ff(b,c,d,a,x[i+3],22,-1044525330);
      a=md5ff(a,b,c,d,x[i+4],7,-176418897);d=md5ff(d,a,b,c,x[i+5],12,1200080426);c=md5ff(c,d,a,b,x[i+6],17,-1473231341);b=md5ff(b,c,d,a,x[i+7],22,-45705983);
      a=md5ff(a,b,c,d,x[i+8],7,1770035416);d=md5ff(d,a,b,c,x[i+9],12,-1958414417);c=md5ff(c,d,a,b,x[i+10],17,-42063);b=md5ff(b,c,d,a,x[i+11],22,-1990404162);
      a=md5ff(a,b,c,d,x[i+12],7,1804603682);d=md5ff(d,a,b,c,x[i+13],12,-40341101);c=md5ff(c,d,a,b,x[i+14],17,-1502002290);b=md5ff(b,c,d,a,x[i+15],22,1236535329);
      a=md5gg(a,b,c,d,x[i+1],5,-165796510);d=md5gg(d,a,b,c,x[i+6],9,-1069501632);c=md5gg(c,d,a,b,x[i+11],14,643717713);b=md5gg(b,c,d,a,x[i],20,-373897302);
      a=md5gg(a,b,c,d,x[i+5],5,-701558691);d=md5gg(d,a,b,c,x[i+10],9,38016083);c=md5gg(c,d,a,b,x[i+15],14,-660478335);b=md5gg(b,c,d,a,x[i+4],20,-405537848);
      a=md5gg(a,b,c,d,x[i+9],5,568446438);d=md5gg(d,a,b,c,x[i+14],9,-1019803690);c=md5gg(c,d,a,b,x[i+3],14,-187363961);b=md5gg(b,c,d,a,x[i+8],20,1163531501);
      a=md5gg(a,b,c,d,x[i+13],5,-1444681467);d=md5gg(d,a,b,c,x[i+2],9,-51403784);c=md5gg(c,d,a,b,x[i+7],14,1735328473);b=md5gg(b,c,d,a,x[i+12],20,-1926607734);
      a=md5hh(a,b,c,d,x[i+5],4,-378558);d=md5hh(d,a,b,c,x[i+8],11,-2022574463);c=md5hh(c,d,a,b,x[i+11],16,1839030562);b=md5hh(b,c,d,a,x[i+14],23,-35309556);
      a=md5hh(a,b,c,d,x[i+1],4,-1530992060);d=md5hh(d,a,b,c,x[i+4],11,1272893353);c=md5hh(c,d,a,b,x[i+7],16,-155497632);b=md5hh(b,c,d,a,x[i+10],23,-1094730640);
      a=md5hh(a,b,c,d,x[i+13],4,681279174);d=md5hh(d,a,b,c,x[i],11,-358537222);c=md5hh(c,d,a,b,x[i+3],16,-722521979);b=md5hh(b,c,d,a,x[i+6],23,76029189);
      a=md5hh(a,b,c,d,x[i+9],4,-640364487);d=md5hh(d,a,b,c,x[i+12],11,-421815835);c=md5hh(c,d,a,b,x[i+15],16,530742520);b=md5hh(b,c,d,a,x[i+2],23,-995338651);
      a=md5ii(a,b,c,d,x[i],6,-198630844);d=md5ii(d,a,b,c,x[i+7],10,1126891415);c=md5ii(c,d,a,b,x[i+14],15,-1416354905);b=md5ii(b,c,d,a,x[i+5],21,-57434055);
      a=md5ii(a,b,c,d,x[i+12],6,1700485571);d=md5ii(d,a,b,c,x[i+3],10,-1894986606);c=md5ii(c,d,a,b,x[i+10],15,-1051523);b=md5ii(b,c,d,a,x[i+1],21,-2054922799);
      a=md5ii(a,b,c,d,x[i+8],6,1873313359);d=md5ii(d,a,b,c,x[i+15],10,-30611744);c=md5ii(c,d,a,b,x[i+6],15,-1560198380);b=md5ii(b,c,d,a,x[i+13],21,1309151649);
      a=md5ii(a,b,c,d,x[i+4],6,-145523070);d=md5ii(d,a,b,c,x[i+11],10,-1120210379);c=md5ii(c,d,a,b,x[i+2],15,718787259);b=md5ii(b,c,d,a,x[i+9],21,-343485551);
      a=safeAdd(a,olda);b=safeAdd(b,oldb);c=safeAdd(c,oldc);d=safeAdd(d,oldd);
    }
    return[a,b,c,d];
  }
  const binaryStr=unescape(encodeURIComponent(str));
  return hex(binlMD5(str2binl(binaryStr),binaryStr.length*8));
}

function getGravatarUrl(email, size = 32) {
  const hash = md5(email.trim().toLowerCase());
  // d=404 means return HTTP 404 instead of a fallback image, so we can detect "no gravatar"
  return `https://www.gravatar.com/avatar/${hash}?d=404&s=${size}`;
}

function getDiceBearUrl(name, email, size = 32) {
  const seed = encodeURIComponent((name || email || '?').trim());
  return `https://api.dicebear.com/7.x/shapes/svg?seed=${seed}&size=${size}`;
}

/**
 * Initials-based avatar rendered as a colored <div>.
 */
export function InitialsAvatar({ name, email, size = 32, style = {} }) {
  const initials = useMemo(() => getInitials(name, email), [name, email]);
  const color = useMemo(() => stringToColor(name || email), [name, email]);
  const fontSize = Math.max(9, Math.floor(size * 0.38));

  return (
    <div
      className="rounded-circle d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: color,
        color: '#fff',
        fontSize,
        userSelect: 'none',
        letterSpacing: '-0.5px',
        ...style,
      }}
    >
      {initials}
    </div>
  );
}

/**
 * Smart Avatar component.
 *
 * Behaviour based on `avatarStyle` setting:
 *  - 'gravatar'  → tries Gravatar, falls back to initials if no account found
 *  - 'initials'  → always shows the coloured initials circle
 *  - 'fun'       → uses DiceBear illustrated shapes, falls back to initials
 */
export default function Avatar({ name, email, size = 32, style = {} }) {
  const { settings } = useApp();
  const avatarStyle = settings.avatar_style || 'gravatar';
  const [imgFailed, setImgFailed] = useState(false);

  // Always reset failure state when email/style changes
  const key = `${email}-${avatarStyle}`;

  if (avatarStyle === 'initials' || !email) {
    return <InitialsAvatar name={name} email={email} size={size} style={style} />;
  }

  if (imgFailed) {
    return <InitialsAvatar name={name} email={email} size={size} style={style} />;
  }

  const src = avatarStyle === 'fun'
    ? getDiceBearUrl(name, email, size * 2)
    : getGravatarUrl(email, size * 2); // 2× for retina

  const altText = getInitials(name, email);

  return (
    <img
      key={key}
      src={src}
      alt={altText}
      className="rounded-circle flex-shrink-0"
      style={{ width: size, height: size, objectFit: 'cover', ...style }}
      onError={() => setImgFailed(true)}
    />
  );
}
