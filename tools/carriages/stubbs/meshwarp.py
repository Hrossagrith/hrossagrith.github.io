"""Piecewise-affine mesh warp: a triangle mesh over the source image is moved
to new vertex positions and the texture follows (painter's order)."""
import numpy as np


def grid_mesh(x0, y0, x1, y1, step):
    xs = np.arange(x0, x1 + step, step, dtype=np.float64)
    ys = np.arange(y0, y1 + step, step, dtype=np.float64)
    gx, gy = np.meshgrid(xs, ys)
    verts = np.stack([gx.ravel(), gy.ravel()], 1)
    nx, ny = len(xs), len(ys)
    tris = []
    for j in range(ny - 1):
        for i in range(nx - 1):
            a = j * nx + i
            b, c, d = a + 1, a + nx, a + nx + 1
            tris.append((a, b, d))
            tris.append((a, d, c))
    return verts, np.array(tris, dtype=np.int64), (nx, ny)


def _bilinear(arr, sx, sy):
    h, w = arr.shape[:2]
    x0 = np.clip(np.floor(sx).astype(int), 0, w - 2)
    y0 = np.clip(np.floor(sy).astype(int), 0, h - 2)
    fx = np.clip(sx - x0, 0, 1)[:, None]
    fy = np.clip(sy - y0, 0, 1)[:, None]
    p00 = arr[y0, x0]
    p10 = arr[y0, x0 + 1]
    p01 = arr[y0 + 1, x0]
    p11 = arr[y0 + 1, x0 + 1]
    return p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy


def warp(src, verts_src, verts_dst, tris, out_size, order=None, out=None):
    """src: float32 HxWxC array. Triangles are drawn in `order` (later ones
    overwrite earlier ones). Returns the output array and a coverage mask."""
    W, H = out_size
    C = src.shape[2]
    if out is None:
        out = np.zeros((H, W, C), dtype=np.float32)
    cover = np.zeros((H, W), dtype=bool)
    idx = range(len(tris)) if order is None else order
    for t in idx:
        a, b, c = tris[t]
        d0, d1, d2 = verts_dst[a], verts_dst[b], verts_dst[c]
        s0, s1, s2 = verts_src[a], verts_src[b], verts_src[c]
        xmin = int(max(0, np.floor(min(d0[0], d1[0], d2[0]))))
        xmax = int(min(W - 1, np.ceil(max(d0[0], d1[0], d2[0]))))
        ymin = int(max(0, np.floor(min(d0[1], d1[1], d2[1]))))
        ymax = int(min(H - 1, np.ceil(max(d0[1], d1[1], d2[1]))))
        if xmax < xmin or ymax < ymin:
            continue
        den = (d1[1] - d2[1]) * (d0[0] - d2[0]) + (d2[0] - d1[0]) * (d0[1] - d2[1])
        if abs(den) < 1e-9:
            continue
        ys, xs = np.mgrid[ymin:ymax + 1, xmin:xmax + 1]
        px = xs.ravel() + 0.5
        py = ys.ravel() + 0.5
        l0 = ((d1[1] - d2[1]) * (px - d2[0]) + (d2[0] - d1[0]) * (py - d2[1])) / den
        l1 = ((d2[1] - d0[1]) * (px - d2[0]) + (d0[0] - d2[0]) * (py - d2[1])) / den
        l2 = 1 - l0 - l1
        eps = -1e-3
        inside = (l0 >= eps) & (l1 >= eps) & (l2 >= eps)
        if not inside.any():
            continue
        l0, l1, l2 = l0[inside], l1[inside], l2[inside]
        sx = l0 * s0[0] + l1 * s1[0] + l2 * s2[0]
        sy = l0 * s0[1] + l1 * s1[1] + l2 * s2[1]
        val = _bilinear(src, sx, sy)
        oy = ys.ravel()[inside]
        ox = xs.ravel()[inside]
        out[oy, ox] = val
        cover[oy, ox] = True
    return out, cover
