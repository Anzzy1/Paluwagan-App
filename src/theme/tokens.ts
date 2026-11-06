export const palette = {
  light: {
    bg: '#F7F5F0',
    surface: '#FFFFFF',
    surfaceAlt: '#EFECE4',
    border: '#E7E2D8',
    text: '#17150F',
    textMuted: '#6F6A5E',
    textFaint: '#A39E92',
    accent: '#FFC83D',
    accentInk: '#17150F',
    ink: '#17150F', // high-contrast block (buttons, hero)
    onInk: '#FFFFFF',
    success: '#1F9D55',
    successBg: '#E3F5EA',
    warning: '#C77700',
    warningBg: '#FFF1D6',
    danger: '#D93B3B',
    dangerBg: '#FCE6E4',
    info: '#2F6FEB',
    infoBg: '#E5EDFD',
    overlay: 'rgba(23,21,15,0.45)',
  },
  dark: {
    bg: '#0F0F10',
    surface: '#1A1A1C',
    surfaceAlt: '#232326',
    border: '#2C2C30',
    text: '#F5F3EE',
    textMuted: '#A8A49B',
    textFaint: '#6E6B65',
    accent: '#FFC83D',
    accentInk: '#17150F',
    ink: '#F5F3EE',
    onInk: '#17150F',
    success: '#4ADE80',
    successBg: '#16301F',
    warning: '#FBBF24',
    warningBg: '#33270F',
    danger: '#F87171',
    dangerBg: '#3A1A1A',
    info: '#7AA7FF',
    infoBg: '#18233A',
    overlay: 'rgba(0,0,0,0.6)',
  },
} as const;

export type Colors = { [K in keyof typeof palette.light]: string };

/** Pastel card tints for circles. [light, dark, strong] */
export const circleTints = {
  mango: { light: '#FFE7A3', dark: '#3A3015', strong: '#FFC83D' },
  leaf: { light: '#CDEFD6', dark: '#173322', strong: '#3CC66C' },
  sky: { light: '#CFE3FF', dark: '#172741', strong: '#4C8DFF' },
  blush: { light: '#FFD6E0', dark: '#3D1C25', strong: '#FF6F91' },
  grape: { light: '#E3D7FF', dark: '#2A2142', strong: '#8B5CF6' },
  coral: { light: '#FFD9C7', dark: '#3D2318', strong: '#FF7A45' },
} as const;
export type CircleTint = keyof typeof circleTints;
export const tintNames = Object.keys(circleTints) as CircleTint[];

export const radius = { sm: 12, md: 18, lg: 24, xl: 32, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const font = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const circleEmojis = ['💰', '🏠', '🎓', '✈️', '🛵', '💍', '🎄', '🍜', '📱', '🌴', '🐷', '⭐'];
export const avatarEmojis = ['🙂', '😎', '🤑', '🥳', '🦊', '🐼', '🐯', '🐸', '🌻', '🔥', '👑', '🍀'];
