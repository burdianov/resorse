/**
 * Neutral, configurable branding (BIG-PROMPT §0.2/§1.2). No reference brand
 * name, logo or font is ever carried over; the mark is drawn from the name at
 * render time so there is no image asset to replace.
 *
 * This file is the single source for the name shown in the sidebar and the
 * mobile header. Tenant-facing settings (`/admin/settings`, F040) may later
 * override it at runtime; until then it is a build-time constant.
 */
export const APP_NAME = 'Application Platform'

/** Initial used in the square brand mark. */
export const APP_MARK = APP_NAME.charAt(0).toUpperCase()
