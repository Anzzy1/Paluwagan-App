export const palette = {
  light: {
    bg: '#F4F5F4',
    surface: '#FFFFFF',
    surfaceAlt: '#F0F2F0',
    border: '#E9ECE9',
    borderStrong: '#D6DBD7',
    text: '#0C1410',
    textMuted: '#58625D',
    textFaint: '#98A29C',
    brand: '#22C55E',
    brandDeep: '#16A34A',
    /** Brand green for text on light surfaces (the button green is too light to read as text). */
    brandText: '#15963F',
    brandSoft: '#E5F6EB',
    onBrand: '#FFFFFF',
    gold: '#F5B53D',
    goldSoft: '#FFF5DC',
    ink: '#0C1410',
    onInk: '#FFFFFF',
    inkMuted: 'rgba(255,255,255,0.7)',
    success: '#16A34A',
    successBg: '#E5F6EB',
    warning: '#E2700B',
    warningBg: '#FFF1E2',
    danger: '#E0393E',
    dangerBg: '#FDECEC',
    info: '#2F6FEB',
    infoBg: '#EBF2FE',
    overlay: 'rgba(12,20,16,0.45)',
    shadow: '#0C1410',
    /** Soft "featured" gradient (mint to sky), used for Ipon's cards. */
    featureA: '#E2F7E9',
    featureB: '#E5F0FD',
  },
  dark: {
    bg: '#090C0A',
    surface: '#131714',
    surfaceAlt: '#1B201C',
    border: '#222924',
    borderStrong: '#323B35',
    text: '#EEF3EF',
    textMuted: '#A1ACA5',
    textFaint: '#66716A',
    brand: '#34D27A',
    brandDeep: '#22B262',
    brandText: '#34D27A',
    brandSoft: '#11291A',
    onBrand: '#04140A',
    gold: '#F5B53D',
    goldSoft: '#2E2410',
    ink: '#EEF3EF',
    onInk: '#0C1410',
    inkMuted: 'rgba(12,20,16,0.62)',
    success: '#45D07F',
    successBg: '#0F2A1C',
    warning: '#FF9A3D',
    warningBg: '#2E1E0E',
    danger: '#FF6B6E',
    dangerBg: '#331617',
    info: '#6EA2FF',
    infoBg: '#14213A',
    overlay: 'rgba(0,0,0,0.6)',
    shadow: '#000000',
    featureA: '#0F2619',
    featureB: '#111E30',
  },
} as const;

export type Colors = { [K in keyof typeof palette.light]: string };

/**
 * Circle colours. Keys are stored in the database (`circles.color`), so they stay stable.
 * `grad` drives the colourful circle cards; `soft`/`dark` tint icon tiles.
 */
export const circleTints = {
  mango: { name: 'Orange', strong: '#F2711C', grad: ['#FFA24C', '#F2671C'], light: '#FFF0E3', dark: '#2E1C0F' },
  leaf: { name: 'Green', strong: '#16A34A', grad: ['#3BD47E', '#13954A'], light: '#E5F6EB', dark: '#11291A' },
  sky: { name: 'Blue', strong: '#2F6FEB', grad: ['#5AA2FF', '#2A5FE0'], light: '#EAF1FE', dark: '#14213A' },
  blush: { name: 'Pink', strong: '#E5365F', grad: ['#FF7896', '#E2365E'], light: '#FFECF0', dark: '#33141C' },
  grape: { name: 'Purple', strong: '#7350E8', grad: ['#A387FF', '#6A45E3'], light: '#F1ECFF', dark: '#211A3D' },
  coral: { name: 'Gold', strong: '#D9961A', grad: ['#FFCB52', '#EE9F1C'], light: '#FFF4D9', dark: '#2E2410' },
} as const;
export type CircleTint = keyof typeof circleTints;
export const tintNames = Object.keys(circleTints) as CircleTint[];

export const radius = { xs: 8, sm: 12, md: 16, lg: 24, xl: 28, pill: 999 } as const;

export const font = {
  regular: 'PlusJakartaSans_500Medium',
  medium: 'PlusJakartaSans_600SemiBold',
  semibold: 'PlusJakartaSans_700Bold',
  bold: 'PlusJakartaSans_800ExtraBold',
  black: 'PlusJakartaSans_800ExtraBold',
} as const;

/** Icons offered for circles and goals, with what the money is for (stored in the `emoji` columns). */
export const iconChoices = [
  { icon: 'dollar-sign', label: 'Savings' },
  { icon: 'umbrella', label: 'Emergency' },
  { icon: 'home', label: 'House' },
  { icon: 'book-open', label: 'School' },
  { icon: 'briefcase', label: 'Business' },
  { icon: 'truck', label: 'Vehicle' },
  { icon: 'globe', label: 'Travel' },
  { icon: 'users', label: 'Barkada' },
] as const;
export const circleIcons = iconChoices.map((x) => x.icon);

export const DESKTOP_BREAKPOINT = 1024;
export const SIDEBAR_WIDTH = 256;
export const CONTENT_MAX_WIDTH = 1120;
