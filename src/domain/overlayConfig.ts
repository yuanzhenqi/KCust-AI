export type OverlayDockSide = 'auto' | 'left' | 'right'
export type OverlaySize = 'small' | 'medium' | 'large'
export type OverlayOpacity = 0.6 | 0.8 | 1

export type OverlayConfig = {
  dockSide: OverlayDockSide
  size: OverlaySize
  opacity: OverlayOpacity
}

export const defaultOverlayConfig: OverlayConfig = {
  dockSide: 'auto',
  size: 'medium',
  opacity: 1,
}

export function normalizeOverlayConfig(config: Partial<OverlayConfig>): OverlayConfig {
  return {
    dockSide: isOverlayDockSide(config.dockSide) ? config.dockSide : defaultOverlayConfig.dockSide,
    size: isOverlaySize(config.size) ? config.size : defaultOverlayConfig.size,
    opacity: isOverlayOpacity(config.opacity) ? config.opacity : defaultOverlayConfig.opacity,
  }
}

export function parseStoredOverlayConfig(raw: string | null): OverlayConfig {
  if (!raw) return defaultOverlayConfig

  try {
    return normalizeOverlayConfig(JSON.parse(raw))
  } catch {
    return defaultOverlayConfig
  }
}

export function serializeOverlayConfig(config: Partial<OverlayConfig>): string {
  return JSON.stringify(normalizeOverlayConfig(config))
}

function isOverlayDockSide(value: unknown): value is OverlayDockSide {
  return value === 'auto' || value === 'left' || value === 'right'
}

function isOverlaySize(value: unknown): value is OverlaySize {
  return value === 'small' || value === 'medium' || value === 'large'
}

function isOverlayOpacity(value: unknown): value is OverlayOpacity {
  return value === 0.6 || value === 0.8 || value === 1
}
