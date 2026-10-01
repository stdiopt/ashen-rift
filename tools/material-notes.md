# Flagstone material v2

The source image was generated with the built-in image-generation tool using this brief: seamless grayscale elevation map of irregular medieval flagstones, broad raised faces, smoothly beveled edges, recessed mortar, chips and fine roughness, orthographic top-down, no color, lighting, shadows or text.

The image still contained apparent shading, so its brightness is **not** used directly as height. `build-stone-material.py` segments stone outlines, reconstructs beveled elevation from distance to mortar, and computes tangent-space normals from that numerical height. Color and roughness are derived from the same boundaries. The source is `public/textures/flagstone-source-v2.png`; final matched channels are `flagstone-albedo-v2.webp`, `flagstone-height-v2.png`, `flagstone-normal-v2.png`, and `flagstone-roughness-v2.png` under `public/textures/`.

Regenerate with Python, Pillow, NumPy and SciPy:

```sh
python tools/build-stone-material.py public/textures/flagstone-source-v2.png
```

All channels use identical 1024px resolution and world UVs. Normal and roughness textures remain linear numerical data. Height is retained as authoring data; the game uses normal mapping rather than tessellation or parallax. Paired-edge blending and wrapped filtering reduce repeat seams; the generated outline is approximate, not a physically scanned surface.
