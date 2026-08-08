import { el } from './dom';

function hashOrigin(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

const SAFE_ICON_DATA = /^data:image\/(?:png|jpeg|webp|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/]+={0,2}$/;

function generatedAvatar(origin: string, label: string, size: 'small' | 'large') {
  const avatar = el('span', `site-avatar site-avatar-${size}`);
  const hash = hashOrigin(origin);
  const hue = 218 + (hash % 78);
  avatar.style.setProperty('--site-hue', String(hue));
  avatar.textContent = (label.trim()[0] || '?').toUpperCase();
  avatar.setAttribute('aria-hidden', 'true');
  return avatar;
}

export function siteAvatar(
  origin: string,
  label = origin,
  size: 'small' | 'large' = 'small',
  iconData?: string
) {
  if (!iconData || iconData.length > 66_000 || !SAFE_ICON_DATA.test(iconData)) {
    return generatedAvatar(origin, label, size);
  }

  const image = el('img', `site-avatar site-avatar-${size}`) as HTMLImageElement;
  image.src = iconData;
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.addEventListener('error', () => {
    image.replaceWith(generatedAvatar(origin, label, size));
  }, { once: true });
  return image;
}
