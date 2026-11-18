// Graphics detail level, chosen before a world is built.
// ultra: PC (more detailed models, more segments, extra effects); normal: phone / tablet;
// potato: as simple as possible for weak devices (few trees, no effects, low resolution).
// hyper: everything of ultra plus mountain shadows, post-processing (AO, bloom, colour grading), more detail.
export const GFX = { ultra: false, potato: false, hyper: false, lite: false };
export const seg = (lo, hi) => (GFX.ultra ? hi : lo);
