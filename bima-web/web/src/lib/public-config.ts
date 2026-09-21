import { requirePublicEnv } from './env';

/**
 * Values the browser needs. They come from NEXT_PUBLIC_* environment variables only (no built-in
 * defaults) and are inlined at build time, so each one must be written as a literal
 * `process.env.NEXT_PUBLIC_NAME` access. Changing any of them requires `npm run build`.
 */
export const mapConfig = {
  tileUrl: () => requirePublicEnv('NEXT_PUBLIC_MAP_TILE_URL', process.env.NEXT_PUBLIC_MAP_TILE_URL),
  attribution: () => requirePublicEnv('NEXT_PUBLIC_MAP_ATTRIBUTION', process.env.NEXT_PUBLIC_MAP_ATTRIBUTION),
  nominatimUrl: () =>
    requirePublicEnv('NEXT_PUBLIC_NOMINATIM_URL', process.env.NEXT_PUBLIC_NOMINATIM_URL).replace(/\/+$/, ''),
  markerIconUrl: () => requirePublicEnv('NEXT_PUBLIC_MARKER_ICON_URL', process.env.NEXT_PUBLIC_MARKER_ICON_URL),
  markerIconRetinaUrl: () =>
    requirePublicEnv('NEXT_PUBLIC_MARKER_ICON_RETINA_URL', process.env.NEXT_PUBLIC_MARKER_ICON_RETINA_URL),
  markerIconRedUrl: () =>
    requirePublicEnv('NEXT_PUBLIC_MARKER_ICON_RED_URL', process.env.NEXT_PUBLIC_MARKER_ICON_RED_URL),
  markerShadowUrl: () =>
    requirePublicEnv('NEXT_PUBLIC_MARKER_SHADOW_URL', process.env.NEXT_PUBLIC_MARKER_SHADOW_URL),
};

export const modelFormConfig = {
  openRouterEndpointUrl: () =>
    requirePublicEnv('NEXT_PUBLIC_OPENROUTER_ENDPOINT_URL', process.env.NEXT_PUBLIC_OPENROUTER_ENDPOINT_URL),
  onPremiseEndpointUrl: () =>
    requirePublicEnv('NEXT_PUBLIC_ONPREMISE_ENDPOINT_URL', process.env.NEXT_PUBLIC_ONPREMISE_ENDPOINT_URL),
  defaultVlmModelName: () =>
    requirePublicEnv('NEXT_PUBLIC_DEFAULT_MODEL_NAME', process.env.NEXT_PUBLIC_DEFAULT_MODEL_NAME),
  defaultSam3ModelName: () =>
    requirePublicEnv('NEXT_PUBLIC_DEFAULT_SAM3_MODEL_NAME', process.env.NEXT_PUBLIC_DEFAULT_SAM3_MODEL_NAME),
};
